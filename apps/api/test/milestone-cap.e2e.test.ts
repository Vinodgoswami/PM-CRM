import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, loginAs, resetDatabase } from './harness';

// MS-5 (D-044): a project's (or phase's) milestones never add up to more than its contract value (booking + upsells).
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
const call = (agent: Agent, csrf: string, method: 'post' | 'patch' | 'delete', path: string, body?: object) =>
  agent[method](`/api/v1${path}`).set('X-CSRF-Token', csrf).send(body);

const create = (agent: Agent, csrf: string, milestones: { title: string; amountMinor: number; dueDate: string }[]) =>
  call(agent, csrf, 'post', '/projects', {
    name: 'P',
    expectedAmountMinor: 100000,
    status: 'ACTIVE',
    newClient: { name: `C ${Math.random()}` },
    milestones,
  });

const rule = (res: { status: number; body: { error?: { details?: unknown } } }) => [res.status, res.body.error?.details];

test('a new project cannot have milestones worth more than its booking', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const res = await create(agent, csrf, [
    { title: 'A', amountMinor: 60000, dueDate: '2099-01-01' },
    { title: 'B', amountMinor: 50000, dueDate: '2099-02-01' },
  ]);
  expect(rule(res)).toEqual([400, { rule: 'MS-5' }]);
  expect(res.body.error.message).toMatch(/more than the project's value/);
  expect(await prisma.project.count()).toBe(0);
});

test('adding or raising a milestone past the contract value is refused; up to it is fine', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = (await create(agent, csrf, [{ title: 'A', amountMinor: 60000, dueDate: '2099-01-01' }])).body;
  expect(
    rule(await call(agent, csrf, 'post', `/projects/${p.id}/milestones`, { title: 'B', amountMinor: 40001, dueDate: '2099-02-01' })),
  ).toEqual([400, { rule: 'MS-5' }]);
  const ok = await call(agent, csrf, 'post', `/projects/${p.id}/milestones`, { title: 'B', amountMinor: 40000, dueDate: '2099-02-01' });
  expect(ok.status).toBe(201);
  expect(rule(await call(agent, csrf, 'patch', `/milestones/${p.milestones[0].id}`, { amountMinor: 60001 }))).toEqual([
    400,
    { rule: 'MS-5' },
  ]);
});

test('an upsell raises the limit, and the booking cannot drop below the milestones', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = (await create(agent, csrf, [{ title: 'A', amountMinor: 100000, dueDate: '2099-01-01' }])).body;
  await call(agent, csrf, 'post', `/projects/${p.id}/upsells`, { amountMinor: 20000, date: '2026-01-01' });
  const added = await call(agent, csrf, 'post', `/projects/${p.id}/milestones`, {
    title: 'Extra',
    amountMinor: 20000,
    dueDate: '2099-02-01',
  });
  expect(added.status).toBe(201);
  const lower = await call(agent, csrf, 'patch', `/projects/${p.id}`, { expectedAmountMinor: 90000, updatedAt: added.body.updatedAt });
  expect(rule(lower)).toEqual([400, { rule: 'MS-5' }]);
});

test('D-059 removing an upsell the milestones still need says so in words', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = (await create(agent, csrf, [{ title: 'A', amountMinor: 100000, dueDate: '2099-01-01' }])).body;
  const withUpsell = await call(agent, csrf, 'post', `/projects/${p.id}/upsells`, { amountMinor: 20000, date: '2026-01-01' });
  await call(agent, csrf, 'post', `/projects/${p.id}/milestones`, { title: 'Extra', amountMinor: 20000, dueDate: '2099-02-01' });
  const entryId = withUpsell.body.upsellEntries[0].id;
  const res = await call(agent, csrf, 'delete', `/projects/${p.id}/upsells/${entryId}`);
  expect(rule(res)).toEqual([400, { rule: 'MS-5' }]);
  expect(res.body.error.message).toMatch(
    /^Without this upsell, milestones would add up to .+, more than the project's value of .+\. Lower or delete a milestone first, or raise the booking amount\.$/,
  );
  expect(await prisma.upsellEntry.count({ where: { id: entryId } })).toBe(1);
});
