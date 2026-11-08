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
let keyCounter = 0;
const newKey = () => `test-key-${Date.now()}-${++keyCounter}`;

async function projectWithMilestone(agent: Agent, csrf: string) {
  const res = await agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', csrf)
    .send({
      name: 'P',
      expectedAmountMinor: 100000,
      status: 'WON',
      newClient: { name: `C ${Math.random()}` },
      milestones: [{ title: 'Design', amountMinor: 100000, dueDate: '2026-10-01' }],
    });
  return { projectId: res.body.id as string, milestoneId: res.body.milestones[0].id as string };
}

const pay = (agent: Agent, csrf: string, milestoneId: string, body: object, key = newKey()) =>
  agent.post(`/api/v1/milestones/${milestoneId}/payments`).set('X-CSRF-Token', csrf).set('Idempotency-Key', key).send(body);

const statusOf = async (agent: Agent, projectId: string) =>
  (await agent.get(`/api/v1/projects/${projectId}`)).body.milestones[0] as { status: string; balanceMinor: number };

test('marking a milestone paid in full records the details and is audited', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { projectId, milestoneId } = await projectWithMilestone(agent, csrf);
  const res = await pay(agent, csrf, milestoneId, { invoiceId: 'INV-101', paymentDate: '2026-10-05', amountMinor: 100000 });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    milestoneLabel: 'M1',
    invoiceId: 'INV-101',
    paymentDate: '2026-10-05',
    amountMinor: 100000,
    project: { id: projectId },
  });
  expect(await statusOf(agent, projectId)).toMatchObject({ status: 'PAID', balanceMinor: 0 });
  expect(await prisma.auditLog.count({ where: { action: 'payment.create', entityId: projectId } })).toBe(1);
});

test('P-3 partial payments add up to paid', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { projectId, milestoneId } = await projectWithMilestone(agent, csrf);
  await pay(agent, csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 40000 }).expect(201);
  expect((await statusOf(agent, projectId)).balanceMinor).toBe(60000);
  await pay(agent, csrf, milestoneId, { paymentDate: '2026-10-06', amountMinor: 60000 }).expect(201);
  expect((await statusOf(agent, projectId)).status).toBe('PAID');
});

test('P-2 / P-6 over-balance, zero and future dates are refused', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { milestoneId } = await projectWithMilestone(agent, csrf);
  const over = await pay(agent, csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 100001 });
  expect(over.status).toBe(400);
  expect(over.body.error.details).toEqual({ rule: 'P-2' });
  expect((await pay(agent, csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 0 })).status).toBe(400);
  const future = await pay(agent, csrf, milestoneId, { paymentDate: '2999-01-01', amountMinor: 100 });
  expect(future.body.error.details).toEqual({ rule: 'P-6' });
});

test('the same Idempotency-Key never creates a second payment', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { milestoneId } = await projectWithMilestone(agent, csrf);
  const key = newKey();
  const [a, b] = await Promise.all([
    pay(agent, csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 30000 }, key),
    pay(agent, csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 30000 }, key),
  ]);
  expect([a.status, b.status].sort()).toEqual([200, 201]);
  expect(a.body.id).toBe(b.body.id);
  expect(await prisma.payment.count()).toBe(1);
});

test('parallel payments with different keys cannot overpay', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { milestoneId } = await projectWithMilestone(agent, csrf);
  const results = await Promise.all([
    pay(agent, csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 70000 }),
    pay(agent, csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 70000 }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
});

test('a missing Idempotency-Key is refused', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { milestoneId } = await projectWithMilestone(agent, csrf);
  const res = await agent
    .post(`/api/v1/milestones/${milestoneId}/payments`)
    .set('X-CSRF-Token', csrf)
    .send({ paymentDate: '2026-10-05', amountMinor: 100 });
  expect(res.status).toBe(400);
});

test('P-4 details can be edited later; the amount never', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { projectId, milestoneId } = await projectWithMilestone(agent, csrf);
  const p = await pay(agent, csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 100 });
  const edit = await agent
    .patch(`/api/v1/payments/${p.body.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ invoiceId: 'INV-7', milestoneLabel: 'Milestone 1', paymentDate: '2026-10-04', note: 'Bank transfer' });
  expect(edit.status).toBe(200);
  expect(edit.body).toMatchObject({ invoiceId: 'INV-7', milestoneLabel: 'Milestone 1', paymentDate: '2026-10-04', amountMinor: 100 });
  expect(await prisma.auditLog.count({ where: { action: 'payment.update', entityId: projectId } })).toBe(1);
  const amount = await agent.patch(`/api/v1/payments/${p.body.id}`).set('X-CSRF-Token', csrf).send({ amountMinor: 5 });
  expect(amount.status).toBe(400);
});

test('P-5 the CEO reverses once (D-021); reversal of a reversal is refused; a project manager cannot reverse', async () => {
  const sales = await loginAs(app, prisma, 'SALES');
  const { projectId, milestoneId } = await projectWithMilestone(sales.agent, sales.csrf);
  const p = await pay(sales.agent, sales.csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 100000 });
  expect(
    (await sales.agent.post(`/api/v1/payments/${p.body.id}/reverse`).set('X-CSRF-Token', sales.csrf).send({ reason: 'x' })).status,
  ).toBe(403);

  const ceo = await loginAs(app, prisma, 'CEO');
  const rev = await ceo.agent.post(`/api/v1/payments/${p.body.id}/reverse`).set('X-CSRF-Token', ceo.csrf).send({ reason: 'Wrong invoice' });
  expect(rev.status).toBe(201);
  expect(rev.body).toMatchObject({ amountMinor: -100000, reversesPaymentId: p.body.id, note: 'Wrong invoice' });
  expect(await statusOf(ceo.agent, projectId)).toMatchObject({ status: 'OVERDUE', balanceMinor: 100000 });
  expect(
    (await ceo.agent.post(`/api/v1/payments/${p.body.id}/reverse`).set('X-CSRF-Token', ceo.csrf).send({ reason: 'again' })).status,
  ).toBe(409);
  expect(
    (await ceo.agent.post(`/api/v1/payments/${rev.body.id}/reverse`).set('X-CSRF-Token', ceo.csrf).send({ reason: 'undo' })).status,
  ).toBe(409);
  expect((await ceo.agent.post(`/api/v1/payments/${p.body.id}/reverse`).set('X-CSRF-Token', ceo.csrf).send({})).status).toBe(400);
});

test('other reps cannot record payments; the CEO can (D-018)', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  const { milestoneId } = await projectWithMilestone(owner.agent, owner.csrf);
  const other = await loginAs(app, prisma, 'SALES');
  expect((await pay(other.agent, other.csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 100 })).status).toBe(403);
  const ceo = await loginAs(app, prisma, 'CEO');
  expect((await pay(ceo.agent, ceo.csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 100 })).status).toBe(201);
});

test('the database rejects a negative payment that is not a reversal', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'SALES');
  const { milestoneId } = await projectWithMilestone(agent, csrf);
  await expect(
    prisma.payment.create({
      data: { milestoneId, milestoneLabel: 'M1', paymentDate: new Date('2026-10-05'), amountMinor: -5n, createdById: user.id },
    }),
  ).rejects.toThrow();
});

test('D-048 the first payment with an invoice ID gives the milestone its invoice ID; a later one does not replace it', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { milestoneId } = await projectWithMilestone(agent, csrf);
  await pay(agent, csrf, milestoneId, { paymentDate: '2026-10-05', amountMinor: 1000 });
  expect((await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId } })).invoiceId).toBeNull();
  await pay(agent, csrf, milestoneId, { invoiceId: 'CHS/2026-27/72', paymentDate: '2026-10-05', amountMinor: 1000 });
  await pay(agent, csrf, milestoneId, { invoiceId: 'OTHER-1', paymentDate: '2026-10-06', amountMinor: 1000 });
  expect((await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId } })).invoiceId).toBe('CHS/2026-27/72');
});

test('D-055 a milestone shows the date of its latest live payment and that payment, so the date can be changed', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { projectId, milestoneId } = await projectWithMilestone(agent, csrf);
  const detail = async () => (await agent.get(`/api/v1/projects/${projectId}`)).body.milestones[0];
  expect(await detail()).toMatchObject({ paidOn: null, paidPaymentId: null });
  const first = (await pay(agent, csrf, milestoneId, { paymentDate: '2026-07-17', amountMinor: 40000 })).body;
  const second = (await pay(agent, csrf, milestoneId, { paymentDate: '2026-08-14', amountMinor: 60000 })).body;
  expect(await detail()).toMatchObject({ paidOn: '2026-08-14', paidPaymentId: second.id });
  // A reversed payment no longer counts.
  const ceo = await loginAs(app, prisma, 'CEO');
  await ceo.agent.post(`/api/v1/payments/${second.id}/reverse`).set('X-CSRF-Token', ceo.csrf).send({ reason: 'wrong' });
  expect(await detail()).toMatchObject({ paidOn: '2026-07-17', paidPaymentId: first.id });
});
