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
