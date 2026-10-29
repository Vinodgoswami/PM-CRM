import { createPrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildSeed, mulberry32, SEED } from '../scripts/seed-data';
import { assertSafeToSeed, runSeed } from '../scripts/seed';

const TODAY = '2026-10-29';
const prisma = createPrismaClient(process.env.DATABASE_URL);

beforeAll(async () => {
  await runSeed(prisma, { today: TODAY, password: 'seed-test-password' });
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

const day = (d: Date) => d.toISOString().slice(0, 10);
const daysBefore = (iso: string, n: number) => day(new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86_400_000));

test('counts match the documented dataset', async () => {
  expect(await prisma.user.count()).toBe(4);
  expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  expect(await prisma.user.count({ where: { role: 'SALES' } })).toBe(2);
  expect(await prisma.user.count({ where: { role: 'CEO' } })).toBe(1);
  expect(await prisma.client.count()).toBe(15);
  expect(await prisma.clientContact.count({ where: { isPrimary: true } })).toBe(15);
  expect(await prisma.project.count()).toBe(40);
  const byStatus = Object.fromEntries((await prisma.project.groupBy({ by: ['status'], _count: true })).map((g) => [g.status, g._count]));
  expect(byStatus).toEqual({ LEAD: 4, PROPOSAL: 4, WON: 4, ACTIVE: 14, ON_HOLD: 2, COMPLETED: 9, LOST: 3 });
  expect(await prisma.project.count({ where: { parentProjectId: { not: null } } })).toBe(4);
  expect(await prisma.upsellEntry.count()).toBe(6);
  expect(await prisma.setting.count()).toBe(1);
});

test('P-2 no milestone is paid beyond its amount', async () => {
  const milestones = await prisma.milestone.findMany({ include: { payments: true } });
  for (const m of milestones) {
    const paid = m.payments.reduce((s, p) => s + p.amountMinor, 0n);
    expect(paid).toBeLessThanOrEqual(m.amountMinor);
    expect(paid).toBeGreaterThanOrEqual(0n);
  }
});

test('PS-4 every ACTIVE project has dated milestones', async () => {
  const active = await prisma.project.findMany({ where: { status: 'ACTIVE' }, include: { milestones: true } });
  for (const p of active) {
    expect(p.milestones.length).toBeGreaterThan(0);
    for (const m of p.milestones) expect(m.dueDate).not.toBeNull();
  }
});

test('U-2 upsell projects belong to the parent client', async () => {
  const children = await prisma.project.findMany({ where: { parentProjectId: { not: null } }, include: { parentProject: true } });
  for (const c of children) expect(c.clientId).toBe(c.parentProject!.clientId);
});

test('P-6 and PS-6: no future payments, no payments on LOST projects', async () => {
  expect(await prisma.payment.count({ where: { paymentDate: { gt: new Date(`${TODAY}T00:00:00Z`) } } })).toBe(0);
  expect(await prisma.payment.count({ where: { milestone: { project: { status: 'LOST' } } } })).toBe(0);
});

test('PS-2 booked projects have wonAt; pipeline projects do not', async () => {
  expect(await prisma.project.count({ where: { status: { in: ['LEAD', 'PROPOSAL'] }, wonAt: { not: null } } })).toBe(0);
  expect(await prisma.project.count({ where: { status: { in: ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'] }, wonAt: null } })).toBe(0);
});

test('dataset covers overdue (>90 days), partially paid and reversal cases', async () => {
  const milestones = await prisma.milestone.findMany({ include: { payments: true } });
  const paidOf = (m: (typeof milestones)[number]) => m.payments.reduce((s, p) => s + p.amountMinor, 0n);
  const old = daysBefore(TODAY, 90);
  expect(milestones.some((m) => m.dueDate && day(m.dueDate) <= old && paidOf(m) < m.amountMinor)).toBe(true);
  expect(milestones.some((m) => paidOf(m) > 0n && paidOf(m) < m.amountMinor)).toBe(true);
  expect(await prisma.payment.count({ where: { reversesPaymentId: { not: null } } })).toBe(1);
});

test('buildSeed is deterministic', () => {
  const a = buildSeed(TODAY, mulberry32(SEED));
  const b = buildSeed(TODAY, mulberry32(SEED));
  expect(a.projects.map((p) => [p.name, p.expectedAmountMinor])).toEqual(b.projects.map((p) => [p.name, p.expectedAmountMinor]));
});

test('seeding refuses non-local databases unless explicitly confirmed', () => {
  expect(() => assertSafeToSeed({ DATABASE_URL: 'postgresql://u:p@db.prod.example.com:5432/crm' }, [])).toThrow(/refusing/i);
  expect(() => assertSafeToSeed({ DATABASE_URL: 'postgresql://u:p@localhost:5432/crm', NODE_ENV: 'production' }, [])).toThrow(/refusing/i);
  expect(() => assertSafeToSeed({ DATABASE_URL: 'postgresql://u:p@localhost:5432/crm' }, [])).not.toThrow();
  expect(() => assertSafeToSeed({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/crm' }, [])).not.toThrow();
  expect(() => assertSafeToSeed({ DATABASE_URL: 'postgresql://u:p@db.staging.example.com/crm' }, ['--yes-wipe'])).not.toThrow();
});
