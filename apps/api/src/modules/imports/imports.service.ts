import { Injectable } from '@nestjs/common';
import { type ImportError, type ImportProject, parseImport } from '@salescrm/core';
import { type ImportPreview, type ImportResult } from '@salescrm/schemas';
import { type Prisma } from '@salescrm/database';
import { type SessionUser } from '../../common/current-user';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { ClientsService, nameKeyOf } from '../clients/clients.service';
import { PrismaService } from '../prisma/prisma.module';
import { SettingsService } from '../settings/settings.service';

type Db = Prisma.TransactionClient;
const toDate = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);
interface Checked {
  projects: ImportProject[];
  errors: ImportError[];
  /** nameKey → existing client id */
  clients: Map<string, string>;
  /** owner email (lower case) → user id */
  owners: Map<string, string>;
}

/** CSV import of existing work (P6-4). Preview and import run the same checks; import is all-or-nothing. */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly clients: ClientsService,
    private readonly audit: AuditService,
  ) {}

  /** File rules (core) plus what needs the database: known owners, existing clients, no duplicate projects. */
  private async check(db: Db, csv: string): Promise<Checked> {
    const [settings, today] = await Promise.all([this.settings.get(), this.settings.today()]);
    const plan = parseImport(csv, { today, baseCurrency: settings.baseCurrency });
    const errors = [...plan.errors];

    const keys = [...new Set(plan.projects.map((p) => nameKeyOf(p.client.name)))];
    const found = await db.client.findMany({ where: { nameKey: { in: keys } }, select: { id: true, nameKey: true, name: true } });
    const clients = new Map(found.flatMap((c) => (c.nameKey ? [[c.nameKey, c.id] as const] : [])));

    const emails = [...new Set(plan.projects.flatMap((p) => (p.ownerEmail ? [p.ownerEmail.toLowerCase()] : [])))];
    const users = await db.user.findMany({
      where: { email: { in: emails, mode: 'insensitive' }, active: true, role: { in: ['ADMIN', 'SALES'] } },
      select: { id: true, email: true },
    });
    const owners = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

    const existing = clients.size
      ? await db.project.findMany({
          where: { clientId: { in: [...clients.values()] } },
          select: { clientId: true, name: true, code: true },
        })
      : [];
    const ok: ImportProject[] = [];
    for (const p of plan.projects) {
      const clientId = clients.get(nameKeyOf(p.client.name));
      const dup = existing.find((e) => e.clientId === clientId && e.name.trim().toLowerCase() === p.name.trim().toLowerCase());
      if (dup) {
        errors.push({ line: p.line, message: `Project "${p.name}" already exists for ${p.client.name} (${dup.code}).` });
      } else if (p.ownerEmail && !owners.has(p.ownerEmail.toLowerCase())) {
        errors.push({ line: p.line, message: `owner_email "${p.ownerEmail}" is not an active Admin or Sales user.` });
      } else ok.push(p);
    }
    errors.sort((a, b) => a.line - b.line);
    return { projects: ok, errors, clients, owners };
  }

  async preview(csv: string): Promise<ImportPreview> {
    const { projects, errors, clients } = await this.check(this.prisma, csv);
    const keys = new Set(projects.map((p) => nameKeyOf(p.client.name)));
    const known = [...keys].filter((k) => clients.has(k)).length;
    return {
      projects: projects.length,
      newClients: keys.size - known,
      existingClients: known,
      milestones: projects.reduce((s, p) => s + p.milestones.length, 0),
      payments: projects.reduce((s, p) => s + p.milestones.reduce((a, m) => a + m.payments.length, 0), 0),
      errors,
      sample: projects.slice(0, 100).map((p) => ({
        line: p.line,
        client: p.client.name,
        clientExists: clients.has(nameKeyOf(p.client.name)),
        name: p.name,
        status: p.status,
        currency: p.currency,
        expectedAmountMinor: Number(p.expectedAmountMinor),
        milestones: p.milestones.length,
        paidMinor: Number(p.milestones.reduce((s, m) => s + m.payments.reduce((a, x) => a + x.amountMinor, 0n), 0n)),
      })),
    };
  }

  async run(user: SessionUser, csv: string): Promise<ImportResult> {
    return this.prisma.$transaction(
      async (tx) => {
        // One import at a time, so two runs of the same file cannot both pass the duplicate check.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('salescrm.import'))`;
        const { projects, errors, clients, owners } = await this.check(tx, csv);
        if (errors.length)
          throw new AppError(400, 'VALIDATION_FAILED', `The file has ${errors.length} problem(s); nothing was imported.`, { errors });
        if (projects.length === 0) throw new AppError(400, 'VALIDATION_FAILED', 'The file has no projects to import.', { errors: [] });

        let newClients = 0;
        let milestones = 0;
        let payments = 0;
        const codes: string[] = [];
        for (const p of projects) {
          const key = nameKeyOf(p.client.name);
          let clientId = clients.get(key);
          if (!clientId) {
            const created = await this.clients.createIn(tx, user, {
              name: p.client.name,
              ...(p.client.email ? { contact: { email: p.client.email } } : {}),
            });
            clientId = created.id;
            clients.set(key, clientId);
            newClients += 1;
          }
          const [seq] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('project_code_seq')`;
          const project = await tx.project.create({
            data: {
              code: `PRJ-${String(seq!.nextval).padStart(4, '0')}`,
              name: p.name,
              description: '',
              clientId,
              ownerId: p.ownerEmail ? owners.get(p.ownerEmail.toLowerCase())! : user.id,
              status: p.status,
              expectedAmountMinor: p.expectedAmountMinor,
              currency: p.currency,
              wonAt: toDate(p.wonAt),
              closedAt: toDate(p.closedAt),
              tags: [],
              createdById: user.id,
            },
          });
          codes.push(project.code);
          for (const [i, m] of p.milestones.entries()) {
            await tx.milestone.create({
              data: {
                projectId: project.id,
                number: i + 1,
                title: m.title,
                amountMinor: m.amountMinor,
                dueDate: toDate(m.dueDate),
                createdById: user.id,
                payments: {
                  create: m.payments.map((x) => ({
                    milestoneLabel: `M${i + 1}`,
                    invoiceId: x.invoiceId,
                    paymentDate: toDate(x.paymentDate)!,
                    amountMinor: x.amountMinor,
                    note: 'Imported',
                    createdById: user.id,
                  })),
                },
              },
            });
            milestones += 1;
            payments += m.payments.length;
          }
        }
        await this.audit.record(tx, {
          actorId: user.id,
          action: 'import.run',
          entity: 'Import',
          entityId: codes[0]!,
          after: { projects: projects.length, newClients, milestones, payments, codes },
        });
        return { projects: projects.length, newClients, milestones, payments };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}
