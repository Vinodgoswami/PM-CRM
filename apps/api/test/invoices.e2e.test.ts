import { type INestApplication } from '@nestjs/common';
import { todayIn } from '@salescrm/core';
import { type PrismaClient } from '@salescrm/database';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, loginAs, resetDatabase } from './harness';

let app: INestApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
});
beforeEach(async () => {
  await resetDatabase(prisma);
});
afterAll(async () => {
  await app.close();
});

type Agent = ReturnType<typeof request.agent>;
const today = () => todayIn('Asia/Kolkata', new Date());
const shift = (days: number) => {
  const [y, m, d] = today().split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

async function project(agent: Agent, csrf: string, status: string, milestones: { title: string; amountMinor: number; dueDate?: string }[]) {
  const res = await agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', csrf)
    .send({ name: `P ${status}`, expectedAmountMinor: 100000, status, newClient: { name: `C ${Math.random()}` }, milestones });
  return res.body as { id: string; milestones: { id: string }[] };
}

test('unpaid milestones are grouped by due date with balance totals; paid and pipeline work excluded', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf, 'WON', [
    { title: 'Late', amountMinor: 1000, dueDate: shift(-3) },
    { title: 'Soon', amountMinor: 2000, dueDate: shift(2) },
    { title: 'Far', amountMinor: 3000, dueDate: shift(120) },
    { title: 'Undated', amountMinor: 4000 },
    { title: 'Paid', amountMinor: 5000, dueDate: shift(-10) },
  ]);
  await agent
    .post(`/api/v1/milestones/${p.milestones[4]!.id}/payments`)
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', 'invoices-test-paid-1')
    .send({ paymentDate: today(), amountMinor: 5000 })
    .expect(201);
  await agent
    .post(`/api/v1/milestones/${p.milestones[0]!.id}/payments`)
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', 'invoices-test-part-1')
    .send({ paymentDate: today(), amountMinor: 400 })
    .expect(201);
  await project(agent, csrf, 'LEAD', [{ title: 'Pipeline', amountMinor: 9999, dueDate: shift(1) }]);

  const res = await agent.get('/api/v1/invoices');
  expect(res.status).toBe(200);
  const groups = res.body.groups as {
    key: string;
    totalMinor: number;
    count: number;
    items: { title: string; balanceMinor: number; daysFromToday: number | null }[];
  }[];
  expect(groups.map((g) => g.key)).toEqual(['OVERDUE', 'THIS_WEEK', 'LATER', 'UNSCHEDULED']);
  expect(groups[0]).toMatchObject({ totalMinor: 600, count: 1 });
  expect(groups[0]!.items[0]).toMatchObject({ title: 'Late', balanceMinor: 600, daysFromToday: -3 });
  expect(groups[1]!.items[0]).toMatchObject({ title: 'Soon', daysFromToday: 2 });
  expect(groups.flatMap((g) => g.items.map((i) => i.title))).not.toContain('Paid');
  expect(groups.flatMap((g) => g.items.map((i) => i.title))).not.toContain('Pipeline');
});

test('SALES see only their own projects, even when filtering by another owner', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  await project(owner.agent, owner.csrf, 'WON', [{ title: 'Mine', amountMinor: 1000, dueDate: shift(5) }]);
  const other = await loginAs(app, prisma, 'SALES');
  expect((await other.agent.get('/api/v1/invoices')).body.groups).toEqual([]);
  expect((await other.agent.get(`/api/v1/invoices?ownerId=${owner.user.id}`)).body.groups).toEqual([]);
  const ceo = await loginAs(app, prisma, 'CEO');
  expect((await ceo.agent.get('/api/v1/invoices')).body.groups[0].items[0]).toMatchObject({ title: 'Mine', owner: { id: owner.user.id } });
});

test('each invoice says whether the viewer may edit its milestone', async () => {
  const pm = await loginAs(app, prisma, 'SALES');
  await project(pm.agent, pm.csrf, 'ACTIVE', [{ title: 'Build', amountMinor: 100000, dueDate: shift(10) }]);
  const items = (await pm.agent.get('/api/v1/invoices')).body.groups.flatMap((g: { items: unknown[] }) => g.items);
  expect(items).toMatchObject([{ title: 'Build', canEdit: true }]);
});

test("D-049 each invoice carries its milestone's invoice ID, so it can be paid in one click", async () => {
  const pm = await loginAs(app, prisma, 'SALES');
  const p = await project(pm.agent, pm.csrf, 'ACTIVE', [{ title: 'Build', amountMinor: 100000, dueDate: shift(10) }]);
  await prisma.milestone.update({ where: { id: p.milestones[0]!.id }, data: { invoiceId: 'CHS/2026-27/72' } });
  const items = (await pm.agent.get('/api/v1/invoices')).body.groups.flatMap((g: { items: unknown[] }) => g.items);
  expect(items).toMatchObject([{ title: 'Build', invoiceId: 'CHS/2026-27/72' }]);
});
