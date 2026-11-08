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
let key = 0;

async function wonProjectWithPayment(agent: Agent, csrf: string, client: string, amount: number) {
  const p = await agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', csrf)
    .send({
      name: `P ${client}`,
      expectedAmountMinor: amount,
      status: 'WON',
      newClient: { name: client },
      milestones: [{ title: 'All', amountMinor: amount, dueDate: today() }],
    });
  await agent
    .post(`/api/v1/milestones/${p.body.milestones[0].id}/payments`)
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', `dash-${++key}-${Date.now()}`)
    .send({ paymentDate: today(), amountMinor: amount / 2 })
    .expect(201);
}

test('the dashboard returns KPIs, series, team and tables for the CEO', async () => {
  const rep = await loginAs(app, prisma, 'SALES');
  await wonProjectWithPayment(rep.agent, rep.csrf, 'Acme', 100000);
  const ceo = await loginAs(app, prisma, 'CEO');
  const res = await ceo.agent.get('/api/v1/dashboard?period=THIS_FY');
  expect(res.status).toBe(200);
  expect(res.body.kpis).toMatchObject({ bookedMinor: 100000, collectedMinor: 50000, outstandingMinor: 50000, wonCount: 1 });
  expect(res.body.monthly).toHaveLength(12);
  expect(res.body.forecast).toHaveLength(6);
  expect(res.body.team).toEqual([
    expect.objectContaining({ user: { id: rep.user.id, name: rep.user.name }, bookedMinor: 100000, collectedMinor: 50000 }),
  ]);
  expect(res.body.recentPayments[0]).toMatchObject({ amountMinor: 50000, client: { name: 'Acme' } });
  expect(res.body.topClients[0]).toMatchObject({ name: 'Acme', collectedMinor: 50000 });
});

test('SALES see only their own numbers and no team table', async () => {
  const a = await loginAs(app, prisma, 'SALES');
  await wonProjectWithPayment(a.agent, a.csrf, 'Acme', 100000);
  const b = await loginAs(app, prisma, 'SALES');
  await wonProjectWithPayment(b.agent, b.csrf, 'Bluepeak', 40000);
  const res = await b.agent.get(`/api/v1/dashboard?period=THIS_FY&ownerId=${a.user.id}`);
  expect(res.body.kpis.bookedMinor).toBe(40000);
  expect(res.body.team).toBeNull();
});

test('an unknown period is rejected', async () => {
  const { agent } = await loginAs(app, prisma, 'CEO');
  expect((await agent.get('/api/v1/dashboard?period=FOREVER')).status).toBe(400);
});

test('K11 win rate counts projects won and lost in the period', async () => {
  const rep = await loginAs(app, prisma, 'SALES');
  await wonProjectWithPayment(rep.agent, rep.csrf, 'Acme', 100000);
  const lead = await rep.agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', rep.csrf)
    .send({ name: 'Lost deal', expectedAmountMinor: 50000, status: 'LEAD', newClient: { name: 'Zenith' } });
  await rep.agent.post(`/api/v1/projects/${lead.body.id}/status`).set('X-CSRF-Token', rep.csrf).send({ status: 'LOST' }).expect(200);
  const res = await rep.agent.get('/api/v1/dashboard?period=THIS_FY');
  expect(res.body.kpis.winRate).toBeCloseTo(0.5);
});

test('the dashboard returns quarters, year over year, client revenue, funnel, overdue list and team extras', async () => {
  const rep = await loginAs(app, prisma, 'SALES');
  await wonProjectWithPayment(rep.agent, rep.csrf, 'Acme', 100000);
  // An overdue milestone: due 10 days ago, unpaid.
  const due = new Date(Date.parse(`${today()}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
  await rep.agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', rep.csrf)
    .send({
      name: 'Late',
      expectedAmountMinor: 30000,
      status: 'WON',
      newClient: { name: 'Bluepeak' },
      milestones: [{ title: 'Kickoff', amountMinor: 30000, dueDate: due }],
    })
    .expect(201);
  const ceo = await loginAs(app, prisma, 'CEO');
  const res = await ceo.agent.get('/api/v1/dashboard?period=THIS_FY');
  expect(res.status).toBe(200);
  expect(res.body.kpis.avgDaysToPay).toBe(0);
  expect(res.body.quarters).toHaveLength(4);
  expect(res.body.quarters.reduce((s: number, q: { bookedMinor: number }) => s + q.bookedMinor, 0)).toBe(130000);
  expect(res.body.yearOverYear).toHaveLength(12);
  expect(res.body.clientRevenue.map((c: { name: string }) => c.name)).toEqual(['Acme', 'Bluepeak']);
  expect(res.body.funnel.find((f: { status: string }) => f.status === 'WON')).toEqual({ status: 'WON', count: 2, valueMinor: 130000 });
  expect(res.body.overdue).toEqual([
    expect.objectContaining({
      title: 'Kickoff',
      balanceMinor: 30000,
      daysOverdue: 10,
      client: expect.objectContaining({ name: 'Bluepeak' }),
    }),
  ]);
  expect(res.body.team[0]).toMatchObject({ winRate: 1, avgDealMinor: 65000 });
  expect(res.body.team[0].monthly).toHaveLength(12);
});

test('year-to-date and two-year periods are accepted', async () => {
  const { agent } = await loginAs(app, prisma, 'CEO');
  const ytd = await agent.get('/api/v1/dashboard?period=FY_TO_DATE');
  expect(ytd.status).toBe(200);
  expect(ytd.body.period.to).toBe(today());
  const two = await agent.get('/api/v1/dashboard?period=TWO_FY');
  expect(two.status).toBe(200);
  expect(Date.parse(two.body.period.to) - Date.parse(two.body.period.from)).toBeGreaterThan(700 * 86_400_000);
});

test('upcoming bookings list projects not yet confirmed, biggest first, with their project manager', async () => {
  const rep = await loginAs(app, prisma, 'SALES');
  const make = (name: string, status: string, amount: number) =>
    rep.agent
      .post('/api/v1/projects')
      .set('X-CSRF-Token', rep.csrf)
      .send({ name, expectedAmountMinor: amount, status, newClient: { name: `C ${name}` }, startDate: '2026-12-01' })
      .expect(201);
  await make('Small enquiry', 'LEAD', 10000);
  await make('Big quote', 'PROPOSAL', 90000);
  await wonProjectWithPayment(rep.agent, rep.csrf, 'Acme', 50000);
  const { agent } = await loginAs(app, prisma, 'CEO');
  const res = await agent.get('/api/v1/dashboard?period=THIS_QUARTER');
  expect(res.body.upcomingBookings).toEqual([
    expect.objectContaining({
      name: 'Big quote',
      status: 'PROPOSAL',
      expectedAmountMinor: 90000,
      startDate: '2026-12-01',
      owner: expect.objectContaining({ id: rep.user.id }),
    }),
    expect.objectContaining({ name: 'Small enquiry', status: 'LEAD', expectedAmountMinor: 10000 }),
  ]);
});

test('D-036 each user may view the dashboard in their own currency, converted at today’s rate', async () => {
  const pm = await loginAs(app, prisma, 'SALES');
  await wonProjectWithPayment(pm.agent, pm.csrf, 'Rupee Co', 100000); // ₹1,000 booked, ₹500 paid; company base is INR
  const pref = (body: object) => pm.agent.patch('/api/v1/me/preferences').set('X-CSRF-Token', pm.csrf).send(body);

  expect((await pref({ displayCurrency: 'USD' })).status).toBe(200);
  expect((await pm.agent.get('/api/v1/auth/session')).body.user.displayCurrency).toBe('USD');
  const usd = (await pm.agent.get('/api/v1/dashboard?period=THIS_FY')).body;
  expect(usd.currency).toBe('USD');
  expect(usd.conversion).toMatchObject({ from: 'INR', to: 'USD' });
  expect(usd.kpis).toMatchObject({ bookedMinor: 1200, collectedMinor: 600 }); // $12.00 and $6.00

  const ceo = await loginAs(app, prisma, 'CEO');
  const theirs = (await ceo.agent.get('/api/v1/dashboard?period=THIS_FY')).body;
  expect([theirs.currency, theirs.conversion]).toEqual(['INR', null]);

  expect((await pref({ displayCurrency: null })).status).toBe(200);
  expect((await pm.agent.get('/api/v1/dashboard?period=THIS_FY')).body).toMatchObject({ currency: 'INR', conversion: null });
  expect((await pref({ displayCurrency: 'usd1' })).status).toBe(400);
});

test('D-036 projects already in your dashboard currency keep their exact amounts (no round trip through the base)', async () => {
  const pm = await loginAs(app, prisma, 'SALES');
  for (const [name, amount] of [
    ['Dollar A', 3800000],
    ['Dollar B', 2200000],
  ] as const) {
    await pm.agent
      .post('/api/v1/projects')
      .set('X-CSRF-Token', pm.csrf)
      .send({ name, expectedAmountMinor: amount, status: 'ACTIVE', currency: 'USD', newClient: { name: `${name} Co` } })
      .expect(201);
  }
  await pm.agent.patch('/api/v1/me/preferences').set('X-CSRF-Token', pm.csrf).send({ displayCurrency: 'USD' }).expect(200);
  const d = (await pm.agent.get('/api/v1/dashboard?period=THIS_FY')).body;
  expect(d.currency).toBe('USD');
  expect(d.kpis.bookedMinor).toBe(6000000); // exactly $60,000.00 for $38,000 + $22,000
});

test('D-039 switching the company currency keeps every project, each converted at its rate from the day it was created', async () => {
  const pm = await loginAs(app, prisma, 'SALES');
  await wonProjectWithPayment(pm.agent, pm.csrf, 'Rupee Co', 100000); // ₹1,000 while the company currency is INR
  const ceo = await loginAs(app, prisma, 'CEO');
  await ceo.agent.patch('/api/v1/settings').set('X-CSRF-Token', ceo.csrf).send({ baseCurrency: 'USD' }).expect(200);
  const d = (await ceo.agent.get('/api/v1/dashboard?period=THIS_FY')).body;
  expect(d.currency).toBe('USD');
  expect(d.otherCurrencyProjects).toBe(0);
  expect(d.kpis).toMatchObject({ bookedMinor: 1200, collectedMinor: 600 }); // ₹1,000 × 0.012 = $12.00
});

test('D-039 the clients list is in your currency, each project converted at its starting rate', async () => {
  const pm = await loginAs(app, prisma, 'SALES');
  await wonProjectWithPayment(pm.agent, pm.csrf, 'Rupee Co', 100000);
  const inr = (await pm.agent.get('/api/v1/clients')).body.items[0];
  expect(inr).toMatchObject({ currency: 'INR', totalsCurrency: 'INR', bookedMinor: 100000, collectedMinor: 50000 });
  await pm.agent.patch('/api/v1/me/preferences').set('X-CSRF-Token', pm.csrf).send({ displayCurrency: 'USD' }).expect(200);
  const usd = (await pm.agent.get('/api/v1/clients')).body.items[0];
  expect(usd).toMatchObject({ currency: 'INR', totalsCurrency: 'USD', bookedMinor: 1200, collectedMinor: 600 });
});

test('D-057 the chart series follows the period: weeks of a month, months of a year', async () => {
  const rep = await loginAs(app, prisma, 'SALES');
  await wonProjectWithPayment(rep.agent, rep.csrf, 'Acme', 100000);
  const month = (await rep.agent.get('/api/v1/dashboard?period=THIS_MONTH')).body.periodSeries as {
    from: string;
    to: string;
    collectedMinor: number;
  }[];
  expect(month.length).toBeGreaterThanOrEqual(4);
  expect(month.length).toBeLessThanOrEqual(5);
  const week = month.find((b) => b.from <= today() && today() <= b.to)!;
  expect(week.collectedMinor).toBe(50000);
  expect(month.reduce((s, b) => s + b.collectedMinor, 0)).toBe(50000);
  const year = (await rep.agent.get('/api/v1/dashboard?period=THIS_FY')).body.periodSeries;
  expect(year).toHaveLength(12);
  expect(year[0]).toMatchObject({ label: expect.any(String), from: expect.stringMatching(/-01$/) });
});
