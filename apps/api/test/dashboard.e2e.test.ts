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
  const { agent } = await loginAs(app, prisma, 'ADMIN');
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
