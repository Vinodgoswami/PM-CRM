import { type INestApplication } from '@nestjs/common';
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
let n = 0;

async function paidProject(agent: Agent, csrf: string, client: string, payments: [string, number][]) {
  const p = await agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', csrf)
    .send({
      name: `Project ${client}`,
      expectedAmountMinor: 10000000,
      status: 'WON',
      newClient: { name: client },
      milestones: [{ title: 'All', amountMinor: 10000000, dueDate: '2026-06-01' }],
    });
  for (const [date, amount] of payments) {
    await agent
      .post(`/api/v1/milestones/${p.body.milestones[0].id}/payments`)
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', `billing-test-${++n}`)
      .send({ paymentDate: date, amountMinor: amount, invoiceId: `INV-${n}` })
      .expect(201);
  }
  return p.body.id as string;
}

test('billing lists payments newest first with a total, filtered by period and project', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const a = await paidProject(agent, csrf, 'Acme', [
    ['2026-04-10', 100000],
    ['2026-07-15', 250000],
  ]);
  await paidProject(agent, csrf, 'Bluepeak', [['2026-05-01', 50000]]);
  const all = await agent.get('/api/v1/payments');
  expect(all.body.items.map((p: { paymentDate: string }) => p.paymentDate)).toEqual(['2026-07-15', '2026-05-01', '2026-04-10']);
  expect(all.body.totalMinor).toBe(400000);
  const q1 = await agent.get('/api/v1/payments?from=2026-04-01&to=2026-06-30');
  expect(q1.body.totalMinor).toBe(150000);
  const project = await agent.get(`/api/v1/payments?projectId=${a}`);
  expect(project.body.total).toBe(2);
});

test('reversals are listed and subtract from the total', async () => {
  const pm = await loginAs(app, prisma, 'SALES');
  await paidProject(pm.agent, pm.csrf, 'Acme', [['2026-04-10', 100000]]);
  const { agent, csrf } = await loginAs(app, prisma, 'CEO'); // D-021: the CEO reverses
  const [payment] = (await agent.get('/api/v1/payments')).body.items;
  await agent.post(`/api/v1/payments/${payment.id}/reverse`).set('X-CSRF-Token', csrf).send({ reason: 'Wrong' }).expect(201);
  const after = await agent.get('/api/v1/payments');
  expect(after.body.total).toBe(2);
  expect(after.body.totalMinor).toBe(0);
});

test('SALES only see payments on their own projects, whatever the filter', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  const theirs = await paidProject(owner.agent, owner.csrf, 'Acme', [['2026-04-10', 100000]]);
  const other = await loginAs(app, prisma, 'SALES');
  expect((await other.agent.get('/api/v1/payments')).body.total).toBe(0);
  expect((await other.agent.get(`/api/v1/payments?projectId=${theirs}`)).body.total).toBe(0);
  expect((await other.agent.get(`/api/v1/payments?ownerId=${owner.user.id}`)).body.total).toBe(0);
  const ceo = await loginAs(app, prisma, 'CEO');
  expect((await ceo.agent.get('/api/v1/payments')).body.total).toBe(1);
});

test('CSV export has exact amounts and the same scope', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  await paidProject(agent, csrf, 'Acme, Inc', [['2026-04-10', 1234567]]);
  const res = await agent.get('/api/v1/exports/csv/billing');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('text/csv');
  const [header, row] = res.text.trim().split('\n');
  expect(header).toBe(
    'Date,Client,Project code,Project,Milestone,Invoice ID,Amount,Currency,Rate,Base amount,Base currency,Recorded by,Reversal of',
  );
  // D-020: both amounts on every payment (same currency: rate 1).
  expect(row).toMatch(/^2026-04-10,"Acme, Inc",PRJ-0001,"Project Acme, Inc",M1,INV-\d+,12345\.67,INR,1,12345\.67,INR,[^,]+,$/);
});

test('each payment says whether the viewer may edit its details', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  await paidProject(owner.agent, owner.csrf, 'Acme', [['2026-04-10', 100000]]);
  const [mine] = (await owner.agent.get('/api/v1/payments')).body.items;
  expect(mine.canEdit).toBe(true);

  const admin = await loginAs(app, prisma, 'CEO');
  await admin.agent.post(`/api/v1/payments/${mine.id}/reverse`).set('X-CSRF-Token', admin.csrf).send({ reason: 'Wrong' }).expect(201);
  const rows = (await admin.agent.get('/api/v1/payments')).body.items as { reversesPaymentId: string | null; canEdit: boolean }[];
  expect(rows.find((r) => r.reversesPaymentId)!.canEdit).toBe(false);
  expect(rows.find((r) => !r.reversesPaymentId)!.canEdit).toBe(true);

  const ceo = await loginAs(app, prisma, 'CEO');
  // D-018: the CEO may correct details like any project's owner; reversal rows stay locked for everyone.
  const seen = (await ceo.agent.get('/api/v1/payments')).body.items as { reversesPaymentId: string | null; canEdit: boolean }[];
  expect(seen.find((r) => !r.reversesPaymentId)!.canEdit).toBe(true);
  expect(seen.find((r) => r.reversesPaymentId)!.canEdit).toBe(false);
});
