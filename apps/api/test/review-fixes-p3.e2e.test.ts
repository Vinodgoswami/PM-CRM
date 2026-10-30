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
let k = 0;

async function project(
  agent: Agent,
  csrf: string,
  opts: { client: string; status?: string; currency?: string; amount?: number; due?: string },
) {
  const amount = opts.amount ?? 100000;
  const res = await agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', csrf)
    .send({
      name: `P ${opts.client}`,
      expectedAmountMinor: amount,
      status: opts.status ?? 'WON',
      ...(opts.currency ? { currency: opts.currency } : {}),
      newClient: { name: opts.client },
      milestones: [{ title: 'All', amountMinor: amount, dueDate: opts.due ?? today() }],
    });
  return res.body as { id: string; milestones: { id: string }[] };
}
const pay = (agent: Agent, csrf: string, milestoneId: string, amount: number) =>
  agent
    .post(`/api/v1/milestones/${milestoneId}/payments`)
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', `p3-review-${++k}-${Date.now()}`)
    .send({ paymentDate: today(), amountMinor: amount });

test('D-020 other-currency work is converted at its rates; only work with no rate stays out (M-4 note)', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const inr = await project(agent, csrf, { client: 'Acme' });
  // Test rates: 1 USD = 84 INR; there is no EUR rate, so EUR work cannot be converted.
  const usd = await project(agent, csrf, { client: 'Globex', currency: 'USD', amount: 1000000 });
  const eur = await project(agent, csrf, { client: 'Initech', currency: 'EUR', amount: 1000000 });
  await pay(agent, csrf, inr.milestones[0]!.id, 40000).expect(201);
  await pay(agent, csrf, usd.milestones[0]!.id, 500000).expect(201);
  expect((await pay(agent, csrf, eur.milestones[0]!.id, 500000)).status).toBe(400); // no rate: it must be typed

  const dash = (await agent.get('/api/v1/dashboard?period=THIS_FY')).body;
  // ₹1,000 + $10,000 × 84 = ₹1,000 + ₹8,40,000.
  expect(dash.kpis).toMatchObject({ bookedMinor: 100000 + 84000000, collectedMinor: 40000 + 42000000 });
  expect(dash.otherCurrencyProjects).toBe(1);

  const billing = (await agent.get('/api/v1/payments')).body;
  expect(billing.totalMinor).toBe(40000 + 42000000);
  expect(billing.otherCurrencyPayments).toBe(0);

  const invoices = (await agent.get('/api/v1/invoices')).body;
  expect(invoices.otherCurrencyItems).toBe(1); // the EUR milestone, listed but not summed
});

test('P-8 payments are only recorded on booked work', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const lead = await project(agent, csrf, { client: 'Acme', status: 'LEAD' });
  const res = await pay(agent, csrf, lead.milestones[0]!.id, 100);
  expect(res.status).toBe(400);
  expect(res.body.error.details).toEqual({ rule: 'P-8' });
});

test('CSV cells cannot run formulas, CR is quoted, and the file starts with a UTF-8 BOM', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const p = await project(agent, csrf, { client: '=HYPERLINK("http://x","click")' });
  await agent
    .post(`/api/v1/milestones/${p.milestones[0]!.id}/payments`)
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', `p3-review-csv-${Date.now()}`)
    .send({ paymentDate: today(), amountMinor: 100, invoiceId: '@SUM(1)', milestoneLabel: 'M1\rX' })
    .expect(201);
  const res = await agent.get('/api/v1/exports/csv/billing').buffer(true);
  expect(res.text.charCodeAt(0)).toBe(0xfeff);
  const row = res.text.split('\n')[1]!;
  expect(row).toContain(`"'=HYPERLINK(""http://x"",""click"")"`);
  expect(row).toContain(`'@SUM(1)`);
  expect(row).toContain('"M1\rX"');
});
