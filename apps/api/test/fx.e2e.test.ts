import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, createUser, loginAs, resetDatabase } from './harness';

// D-020 with the fixed test provider: 1 INR = 0.012 USD, 1 USD = 84 INR.
let app: INestApplication;
let prisma: PrismaClient;
type Agent = ReturnType<typeof request.agent>;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
});
beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.setting.upsert({ where: { id: 1 }, update: { baseCurrency: 'USD' }, create: { id: 1, baseCurrency: 'USD' } });
});
afterAll(async () => {
  await app.close();
});

let key = 0;
const pay = (a: Agent, csrf: string, milestoneId: string, body: object) =>
  a
    .post(`/api/v1/milestones/${milestoneId}/payments`)
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', `fx-${++key}-${Date.now()}`)
    .send(body);

async function inrProject(a: Agent, csrf: string, status = 'WON') {
  const res = await a
    .post('/api/v1/projects')
    .set('X-CSRF-Token', csrf)
    .send({
      name: 'Website',
      expectedAmountMinor: 10000000, // ₹1,00,000
      currency: 'INR',
      status,
      newClient: { name: `Client ${Math.random()}` },
      milestones: [{ title: 'Design', amountMinor: 10000000, dueDate: '2026-10-01' }],
    });
  expect(res.status).toBe(201);
  return res.body as { id: string; milestones: { id: string }[] };
}

test('GET /fx-rate gives the day’s rate, caches it, and is 1 for the same currency', async () => {
  const { agent } = await loginAs(app, prisma, 'SALES');
  const res = await agent.get('/api/v1/fx-rate?from=INR&to=USD&date=2026-10-29');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ from: 'INR', to: 'USD', rate: '0.012', date: '2026-10-29', source: 'fixed' });
  expect(await prisma.fxRate.count()).toBe(1);
  expect((await agent.get('/api/v1/fx-rate?from=USD&to=USD&date=2026-10-29')).body).toMatchObject({ rate: '1' });
  const none = await agent.get('/api/v1/fx-rate?from=INR&to=JPY&date=2026-10-29');
  expect(none.status).toBe(400);
  expect(none.body.error.message).toBe('No exchange rate is available for INR → JPY on 2026-10-29. Enter the rate yourself.');
});

test('a payment records both amounts: auto-filled rate, or the one you typed', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await inrProject(agent, csrf);
  const auto = await pay(agent, csrf, p.milestones[0]!.id, { paymentDate: '2026-10-05', amountMinor: 5000000 });
  expect(auto.status).toBe(201);
  expect(auto.body).toMatchObject({ amountMinor: 5000000, baseCurrency: 'USD', fxRate: '0.012', baseAmountMinor: 60000 });
  const typed = await pay(agent, csrf, p.milestones[0]!.id, { paymentDate: '2026-10-06', amountMinor: 1000000, fxRate: '0.0105' });
  expect(typed.body).toMatchObject({ fxRate: '0.0105', baseAmountMinor: 10500 });
  expect((await pay(agent, csrf, p.milestones[0]!.id, { paymentDate: '2026-10-06', amountMinor: 100, fxRate: '-2' })).status).toBe(400);
});

test('correcting a payment’s rate recomputes its base amount; a reversal mirrors the original in both currencies', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await inrProject(agent, csrf);
  const paid = await pay(agent, csrf, p.milestones[0]!.id, { paymentDate: '2026-10-05', amountMinor: 5000000 });
  const fixed = await agent.patch(`/api/v1/payments/${paid.body.id}`).set('X-CSRF-Token', csrf).send({ fxRate: '0.011' });
  expect(fixed.status).toBe(200);
  expect(fixed.body).toMatchObject({ fxRate: '0.011', baseAmountMinor: 55000, amountMinor: 5000000 });
  const admin = await loginAs(app, prisma, 'ADMIN');
  const rev = await admin.agent.post(`/api/v1/payments/${paid.body.id}/reverse`).set('X-CSRF-Token', admin.csrf).send({ reason: 'Wrong' });
  expect(rev.body).toMatchObject({ amountMinor: -5000000, fxRate: '0.011', baseAmountMinor: -55000, baseCurrency: 'USD' });
});

test('a project saves its rate when created and again when it is confirmed', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const lead = await inrProject(agent, csrf, 'LEAD');
  const before = await prisma.project.findUniqueOrThrow({ where: { id: lead.id } });
  expect(before.fxRate?.toString()).toBe('0.012');
  expect(before.fxBaseCurrency).toBe('USD');
  await prisma.project.update({ where: { id: lead.id }, data: { fxRate: '0.5', fxRateDate: new Date('2026-01-01') } });
  await agent.post(`/api/v1/projects/${lead.id}/status`).set('X-CSRF-Token', csrf).send({ status: 'PROPOSAL' }).expect(200);
  await agent.post(`/api/v1/projects/${lead.id}/status`).set('X-CSRF-Token', csrf).send({ status: 'WON' }).expect(200);
  const after = await prisma.project.findUniqueOrThrow({ where: { id: lead.id } });
  expect(after.fxRate?.toString()).toBe('0.012');
  expect(after.fxRateDate?.toISOString().slice(0, 10)).not.toBe('2026-01-01');
});

test('the dashboard, billing and invoices total everything in the base currency', async () => {
  const pm = await createUser(prisma, { role: 'SALES' });
  const ceo = await loginAs(app, prisma, 'CEO');
  const res = await ceo.agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', ceo.csrf)
    .send({
      name: 'Portal',
      expectedAmountMinor: 10000000,
      currency: 'INR',
      status: 'WON',
      ownerId: pm.id,
      newClient: { name: 'Bluepeak' },
      milestones: [
        { title: 'Design', amountMinor: 6000000, dueDate: '2026-10-01' },
        { title: 'Build', amountMinor: 4000000, dueDate: '2099-01-01' },
      ],
    });
  await pay(ceo.agent, ceo.csrf, res.body.milestones[0].id, { paymentDate: '2026-10-05', amountMinor: 5000000, fxRate: '0.0105' });

  const d = (await ceo.agent.get('/api/v1/dashboard?period=TWO_FY')).body;
  expect(d.currency).toBe('USD');
  expect(d.otherCurrencyProjects).toBe(0);
  expect(d.kpis.bookedMinor).toBe(120000); // ₹1,00,000 at the confirmation rate 0.012
  expect(d.kpis.collectedMinor).toBe(52500); // what was actually received, at the payment's own rate
  expect(d.kpis.outstandingMinor).toBe(12000); // ₹10,000 still due on Design, at the project's rate

  const billing = (await ceo.agent.get('/api/v1/payments')).body;
  expect(billing).toMatchObject({ totalMinor: 52500, otherCurrencyPayments: 0 });
  const invoices = (await ceo.agent.get('/api/v1/invoices')).body;
  expect(invoices.otherCurrencyItems).toBe(0);
  expect(invoices.groups.find((g: { key: string }) => g.key === 'OVERDUE').totalMinor).toBe(12000);
});
