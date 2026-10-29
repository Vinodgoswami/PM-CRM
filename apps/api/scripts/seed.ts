/**
 * Demo data for local development and reviews: `pnpm db:seed`. Refuses to run in production and wipes the target
 * database first. Login password comes from SEED_PASSWORD (default `salescrm-dev-only`) and is never printed.
 */
import { hashPassword } from '@salescrm/auth';
import { todayIn, type IsoDate } from '@salescrm/core';
import { createPrismaClient, type PrismaClient } from '@salescrm/database';
import { resetDatabase } from '@salescrm/database/testing';
import { buildSeed, mulberry32, SEED } from './seed-data';

export interface SeedSummary {
  users: string[];
  clients: number;
  projects: number;
  milestones: number;
  payments: number;
}

const date = (d: IsoDate | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

export async function runSeed(prisma: PrismaClient, opts: { today: IsoDate; password: string }): Promise<SeedSummary> {
  const data = buildSeed(opts.today, mulberry32(SEED));
  const passwordHash = await hashPassword(opts.password);
  await resetDatabase(prisma);

  let milestones = 0;
  let payments = 0;
  await prisma.$transaction(
    async (tx) => {
      const userIds = new Map<string, string>();
      for (const u of data.users) {
        const row = await tx.user.create({ data: { name: u.name, email: u.email, role: u.role, passwordHash } });
        userIds.set(u.key, row.id);
      }
      const adminId = userIds.get('admin')!;

      const clientIds: string[] = [];
      for (const c of data.clients) {
        const row = await tx.client.create({
          data: {
            name: c.name,
            company: c.company,
            country: c.country,
            createdById: adminId,
            contacts: { create: { name: c.contactName, email: c.contactEmail, isPrimary: true } },
          },
        });
        clientIds.push(row.id);
      }

      const projectIds: string[] = [];
      for (const p of data.projects) {
        const ownerId = userIds.get(p.owner)!;
        const row = await tx.project.create({
          data: {
            code: p.code,
            name: p.name,
            description: p.description,
            clientId: clientIds[p.clientIndex]!,
            ownerId,
            status: p.status,
            startDate: date(p.startDate),
            durationValue: p.durationMonths,
            durationUnit: 'MONTHS',
            endDate: date(p.endDate),
            expectedAmountMinor: p.expectedAmountMinor,
            currency: 'INR',
            wonAt: date(p.wonAt),
            closedAt: date(p.closedAt),
            createdById: ownerId,
            upsellEntries: {
              create: p.upsellEntries.map((u) => ({ amountMinor: u.amountMinor, date: date(u.date)!, note: u.note, createdById: ownerId })),
            },
          },
        });
        projectIds.push(row.id);

        for (const m of p.milestones) {
          const milestone = await tx.milestone.create({
            data: {
              projectId: row.id,
              number: m.number,
              title: m.title,
              amountMinor: m.amountMinor,
              dueDate: date(m.dueDate),
              createdById: ownerId,
            },
          });
          milestones += 1;
          const paymentIds: string[] = [];
          for (const pay of m.payments) {
            const created = await tx.payment.create({
              data: {
                milestoneId: milestone.id,
                milestoneLabel: `M${m.number}`,
                invoiceId: pay.invoiceId,
                paymentDate: date(pay.paymentDate)!,
                amountMinor: pay.amountMinor,
                reversesPaymentId: pay.reversesIndex === undefined ? null : paymentIds[pay.reversesIndex]!,
                note: pay.reversesIndex === undefined ? null : 'Reversal: recorded against the wrong invoice',
                createdById: ownerId,
              },
            });
            paymentIds.push(created.id);
            payments += 1;
          }
        }
      }

      // Parent links need both projects to exist.
      for (const [i, p] of data.projects.entries()) {
        if (p.parentIndex !== null) {
          await tx.project.update({ where: { id: projectIds[i]! }, data: { parentProjectId: projectIds[p.parentIndex]! } });
        }
      }

      await tx.setting.create({ data: { id: 1, companyName: 'SalesCRM Demo' } });
    },
    { timeout: 120_000 },
  );

  return { users: data.users.map((u) => u.email), clients: data.clients.length, projects: data.projects.length, milestones, payments };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * The seed TRUNCATEs every table. Only run it against a local database, or when the operator passes --yes-wipe;
 * NODE_ENV alone is not trusted (an unset NODE_ENV defaults to development).
 */
export function assertSafeToSeed(env: NodeJS.ProcessEnv, argv: readonly string[]): void {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed: NODE_ENV is production.');
  let host: string;
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    throw new Error('Refusing to seed: DATABASE_URL is missing or invalid.');
  }
  if (!LOCAL_HOSTS.has(host) && !argv.includes('--yes-wipe')) {
    throw new Error(`Refusing to seed: ${host} is not a local database. This wipes every table; pass --yes-wipe to confirm.`);
  }
}

async function main(): Promise<void> {
  try {
    assertSafeToSeed(process.env, process.argv);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const prisma = createPrismaClient(process.env.DATABASE_URL);
  try {
    const summary = await runSeed(prisma, {
      today: todayIn('Asia/Kolkata', new Date()),
      password: process.env.SEED_PASSWORD || 'salescrm-dev-only',
    });
    console.warn(
      `Seeded ${summary.clients} clients, ${summary.projects} projects, ${summary.milestones} milestones, ${summary.payments} payments.\n` +
        `Log in as: ${summary.users.join(', ')} (password: SEED_PASSWORD, or the dev default).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
