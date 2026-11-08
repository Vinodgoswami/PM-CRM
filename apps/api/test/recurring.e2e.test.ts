import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { RecurringService } from '../src/modules/projects/recurring.service';
import { createTestApp, loginAs, resetDatabase } from './harness';

// D-063: monthly recurring milestones, created as each month comes due.
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
const call = (agent: Agent, csrf: string, method: 'post', path: string, body?: object) =>
  agent[method](`/api/v1${path}`).set('X-CSRF-Token', csrf).send(body);

async function project(agent: Agent, csrf: string, booking = 1200000) {
  const res = await call(agent, csrf, 'post', '/projects', {
    name: 'Retainer',
    expectedAmountMinor: booking,
    status: 'ACTIVE',
    newClient: { name: `C ${Math.random()}` },
  });
  return res.body as { id: string };
}

const titles = (body: { milestones: { title: string; dueDate: string }[] }) => body.milestones.map((m) => [m.title, m.dueDate]);

test('a series creates every invoice due so far, then one more as each month arrives, up to its count', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf);
  const res = await call(agent, csrf, 'post', `/projects/${p.id}/recurring`, {
    title: 'Support',
    amountMinor: 100000,
    startDate: '2020-01-15',
    count: 3,
  });
  expect(res.status).toBe(201);
  // All three are in the past, so all exist at once.
  expect(titles(res.body)).toEqual([
    ['Support (1/3)', '2020-01-15'],
    ['Support (2/3)', '2020-02-15'],
    ['Support (3/3)', '2020-03-15'],
  ]);
  expect(res.body.recurring).toEqual([
    expect.objectContaining({ title: 'Support', amountMinor: 100000, startDate: '2020-01-15', count: 3, createdCount: 3, nextDate: null }),
  ]);
  expect(res.body.milestones[0]).toMatchObject({ recurringSeriesId: res.body.recurring[0].id });
});

test('only the months due by today are created; the catch-up adds the next on its date', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf);
  const res = await call(agent, csrf, 'post', `/projects/${p.id}/recurring`, {
    title: 'Retainer',
    amountMinor: 100000,
    startDate: '2099-01-10',
    count: 12,
  });
  expect(res.body.milestones).toEqual([]);
  expect(res.body.recurring[0]).toMatchObject({ createdCount: 0, nextDate: '2099-01-10' });
  const recurring = app.get(RecurringService);
  await recurring.syncAll('2099-03-09');
  const ms = await prisma.milestone.findMany({ where: { projectId: p.id }, orderBy: { number: 'asc' } });
  expect(ms.map((m) => [m.number, m.title, m.dueDate?.toISOString().slice(0, 10)])).toEqual([
    [1, 'Retainer (1/12)', '2099-01-10'],
    [2, 'Retainer (2/12)', '2099-02-10'],
  ]);
  await recurring.syncAll('2099-03-09'); // running again creates nothing twice
  expect(await prisma.milestone.count({ where: { projectId: p.id } })).toBe(2);
});

test('extend adds months, stop ends it, and a deleted month is not recreated', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf);
  const made = await call(agent, csrf, 'post', `/projects/${p.id}/recurring`, {
    title: 'Ops',
    amountMinor: 100000,
    startDate: '2020-01-01',
    count: 2,
  });
  const id = made.body.recurring[0].id;
  await agent.delete(`/api/v1/milestones/${made.body.milestones[1].id}`).set('X-CSRF-Token', csrf).expect(200);
  const extended = await call(agent, csrf, 'post', `/recurring/${id}/extend`, { months: 2 });
  expect(extended.status).toBe(201);
  expect(titles(extended.body)).toEqual([
    ['Ops (1/4)', '2020-01-01'],
    ['Ops (3/4)', '2020-03-01'],
    ['Ops (4/4)', '2020-04-01'],
  ]);
  expect(extended.body.recurring[0]).toMatchObject({ count: 4, createdCount: 4 });
  const future = await call(agent, csrf, 'post', `/projects/${p.id}/recurring`, {
    title: 'Later',
    amountMinor: 100000,
    startDate: '2099-01-01',
    count: 5,
  });
  const stopped = await call(agent, csrf, 'post', `/recurring/${future.body.recurring[1].id}/stop`);
  expect(stopped.body.recurring[1]).toMatchObject({ count: 0, createdCount: 0, nextDate: null });
});

test('MS-5: the whole series must fit the booking when it is created or extended', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf, 1000000);
  const tooMuch = await call(agent, csrf, 'post', `/projects/${p.id}/recurring`, {
    title: 'Big',
    amountMinor: 100000,
    startDate: '2099-01-01',
    count: 11,
  });
  expect([tooMuch.status, tooMuch.body.error.details]).toEqual([400, { rule: 'MS-5' }]);
  const ok = await call(agent, csrf, 'post', `/projects/${p.id}/recurring`, {
    title: 'Fits',
    amountMinor: 100000,
    startDate: '2099-01-01',
    count: 10,
  });
  expect(ok.status).toBe(201);
  const extend = await call(agent, csrf, 'post', `/recurring/${ok.body.recurring[0].id}/extend`, { months: 1 });
  expect([extend.status, extend.body.error.details]).toEqual([400, { rule: 'MS-5' }]);
  // Months not created yet still hold their place: a one-off milestone cannot take it.
  const oneOff = await call(agent, csrf, 'post', `/projects/${p.id}/milestones`, { title: 'X', amountMinor: 1, dueDate: '2099-06-01' });
  expect(oneOff.body.error.details).toEqual({ rule: 'MS-5' });
});
