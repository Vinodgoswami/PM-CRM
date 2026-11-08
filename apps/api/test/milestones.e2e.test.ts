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
const call = (agent: Agent, csrf: string, method: 'post' | 'patch' | 'put' | 'delete', path: string, body?: object) =>
  agent[method](`/api/v1${path}`).set('X-CSRF-Token', csrf).send(body);

async function project(agent: Agent, csrf: string, status = 'WON') {
  const res = await call(agent, csrf, 'post', '/projects', {
    name: 'P',
    expectedAmountMinor: 110000, // MS-5: room for the milestones the tests add
    status,
    newClient: { name: `C ${Math.random()}` },
    milestones: [
      { title: 'Design', amountMinor: 40000, dueDate: '2099-01-01' },
      { title: 'Build', amountMinor: 60000, dueDate: '2099-02-01' },
    ],
  });
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; milestones: { id: string; number: number; title: string }[] };
}

async function pay(milestoneId: string, userId: string, amountMinor: bigint) {
  await prisma.payment.create({
    data: { milestoneId, milestoneLabel: 'M', paymentDate: new Date('2026-10-01'), amountMinor, createdById: userId },
  });
}

test('adding a milestone appends the next number and is audited', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf);
  const res = await call(agent, csrf, 'post', `/projects/${p.id}/milestones`, {
    title: 'Launch',
    amountMinor: 5000,
    dueDate: '2099-03-01',
  });
  expect(res.status).toBe(201);
  expect(res.body.milestones.map((m: { number: number; title: string }) => [m.number, m.title])).toEqual([
    [1, 'Design'],
    [2, 'Build'],
    [3, 'Launch'],
  ]);
  expect(res.body.milestones[2]).toMatchObject({ status: 'SCHEDULED', balanceMinor: 5000, paidMinor: 0 });
  expect(await prisma.auditLog.count({ where: { action: 'milestone.create', entityId: p.id } })).toBe(1);
});

test('editing a milestone is audited; MS-2 the amount cannot go below what is paid', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf);
  const m1 = p.milestones[0]!.id;
  await pay(m1, user.id, 30000n);
  const below = await call(agent, csrf, 'patch', `/milestones/${m1}`, { amountMinor: 20000 });
  expect(below.status).toBe(400);
  expect(below.body.error.details).toEqual({ rule: 'MS-2' });
  const ok = await call(agent, csrf, 'patch', `/milestones/${m1}`, { title: 'Discovery', amountMinor: 30000 });
  expect(ok.status).toBe(200);
  expect(ok.body.milestones[0]).toMatchObject({ title: 'Discovery', amountMinor: 30000, status: 'PAID', balanceMinor: 0 });
  expect(await prisma.auditLog.count({ where: { action: 'milestone.update', entityId: p.id } })).toBe(1);
});

test('MS-1 milestones with payments cannot be deleted; others delete and renumber', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf);
  await pay(p.milestones[1]!.id, user.id, 100n);
  const refused = await call(agent, csrf, 'delete', `/milestones/${p.milestones[1]!.id}`);
  expect(refused.status).toBe(400);
  expect(refused.body.error.details).toEqual({ rule: 'MS-1' });
  const ok = await call(agent, csrf, 'delete', `/milestones/${p.milestones[0]!.id}`);
  expect(ok.status).toBe(200);
  expect(ok.body.milestones.map((m: { number: number; title: string }) => [m.number, m.title])).toEqual([[1, 'Build']]);
});

test('reordering renumbers; a foreign or missing id is refused', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf);
  const [a, b] = p.milestones.map((m) => m.id);
  const ok = await call(agent, csrf, 'put', `/projects/${p.id}/milestones/order`, { ids: [b, a] });
  expect(ok.status).toBe(200);
  expect(ok.body.milestones.map((m: { title: string }) => m.title)).toEqual(['Build', 'Design']);
  expect((await call(agent, csrf, 'put', `/projects/${p.id}/milestones/order`, { ids: [b] })).status).toBe(400);
  expect((await call(agent, csrf, 'put', `/projects/${p.id}/milestones/order`, { ids: [b, 'other'] })).status).toBe(400);
});

test('PS-4 an ACTIVE project keeps dated milestones, and may delete its last one (D-045)', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf, 'ACTIVE');
  const undate = await call(agent, csrf, 'patch', `/milestones/${p.milestones[0]!.id}`, { dueDate: null });
  expect(undate.status).toBe(400);
  expect(undate.body.error.details).toEqual({ rule: 'PS-4' });
  const undatedNew = await call(agent, csrf, 'post', `/projects/${p.id}/milestones`, { title: 'Extra', amountMinor: 100 });
  expect(undatedNew.body.error.details).toEqual({ rule: 'PS-4' });
  await call(agent, csrf, 'delete', `/milestones/${p.milestones[0]!.id}`).expect(200);
  const last = await call(agent, csrf, 'delete', `/milestones/${p.milestones[1]!.id}`);
  expect(last.status).toBe(200);
  expect(last.body.milestones).toEqual([]);
});

test('other reps cannot change milestones; the CEO can (D-018)', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  const p = await project(owner.agent, owner.csrf);
  const other = await loginAs(app, prisma, 'SALES');
  expect((await call(other.agent, other.csrf, 'post', `/projects/${p.id}/milestones`, { title: 'X', amountMinor: 1 })).status).toBe(403);
  expect((await call(other.agent, other.csrf, 'patch', `/milestones/${p.milestones[0]!.id}`, { title: 'X' })).status).toBe(403);
  const ceo = await loginAs(app, prisma, 'CEO');
  expect((await call(ceo.agent, ceo.csrf, 'post', `/projects/${p.id}/milestones`, { title: 'Extra', amountMinor: 1 })).status).toBe(201);
});

test('D-047 a milestone keeps its own invoice ID, apart from its task; it can be changed or cleared', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf);
  const res = await call(agent, csrf, 'post', `/projects/${p.id}/milestones`, {
    title: 'Sprint 3',
    invoiceId: 'CHS/2026-27/72',
    amountMinor: 5000,
    dueDate: '2099-03-01',
  });
  expect(res.status).toBe(201);
  const m = res.body.milestones[2];
  expect(m).toMatchObject({ title: 'Sprint 3', invoiceId: 'CHS/2026-27/72' });
  expect(res.body.milestones[0].invoiceId).toBeNull();
  const changed = await call(agent, csrf, 'patch', `/milestones/${m.id}`, { invoiceId: 'CHS/2026-27/96' });
  expect(changed.body.milestones[2].invoiceId).toBe('CHS/2026-27/96');
  const cleared = await call(agent, csrf, 'patch', `/milestones/${m.id}`, { invoiceId: null });
  expect(cleared.body.milestones[2].invoiceId).toBeNull();
});
