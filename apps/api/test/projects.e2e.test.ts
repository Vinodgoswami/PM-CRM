import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { runSeed } from '../scripts/seed';
import { createTestApp, createUser, loginAs, resetDatabase } from './harness';

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
const post = (agent: Agent, csrf: string, path: string, body: object) => agent.post(`/api/v1${path}`).set('X-CSRF-Token', csrf).send(body);

const base = { name: 'Website', description: 'Redesign', expectedAmountMinor: 30000000 };
const threeMilestones = [
  { title: 'Design', amountMinor: 10000000, dueDate: '2026-11-15' },
  { title: 'Build', amountMinor: 15000000, dueDate: '2026-12-15' },
  { title: 'Launch', amountMinor: 5000000 },
];

async function clientId(agent: Agent, csrf: string, name = 'Acme') {
  return (await post(agent, csrf, '/clients', { name })).body.id as string;
}

test('F1 create with a new client and milestones in one request', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'SALES');
  const res = await post(agent, csrf, '/projects', {
    ...base,
    newClient: { name: 'Acme', email: 'ap@acme.test' },
    startDate: '2026-11-01',
    durationValue: 3,
    durationUnit: 'MONTHS',
    milestones: threeMilestones,
  });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    code: 'PRJ-0001',
    status: 'LEAD',
    currency: 'INR',
    endDate: '2027-02-01',
    owner: { id: user.id },
    client: { name: 'Acme' },
    contractValueMinor: 30000000,
    canEdit: true,
  });
  expect(res.body.milestones.map((m: { number: number; title: string }) => [m.number, m.title])).toEqual([
    [1, 'Design'],
    [2, 'Build'],
    [3, 'Launch'],
  ]);
  expect(await prisma.clientContact.count({ where: { email: 'ap@acme.test', isPrimary: true } })).toBe(1);
  expect(await prisma.auditLog.count({ where: { action: 'project.create', entityId: res.body.id } })).toBe(1);
});

test('C-1 a conflicting new client creates nothing', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const existing = await clientId(agent, csrf);
  const res = await post(agent, csrf, '/projects', { ...base, newClient: { name: ' acme ' } });
  expect(res.status).toBe(409);
  expect(res.body.error.details).toEqual({ clientId: existing });
  expect(await prisma.project.count()).toBe(0);
  expect(await prisma.client.count()).toBe(1);
});

test('exactly one of clientId and newClient is required', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  expect((await post(agent, csrf, '/projects', base)).status).toBe(400);
  const id = await clientId(agent, csrf);
  expect((await post(agent, csrf, '/projects', { ...base, clientId: id, newClient: { name: 'Other' } })).status).toBe(400);
});

test('project codes continue after seeded data', async () => {
  await runSeed(prisma, { today: '2026-10-29', password: 'seed-test-password' });
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const anyClient = await prisma.client.findFirstOrThrow();
  const res = await post(agent, csrf, '/projects', { ...base, clientId: anyClient.id });
  expect(res.status).toBe(201);
  expect(res.body.code).toBe('PRJ-0041');
});

test('owner: SALES always owns what they create; ADMIN may assign', async () => {
  const rep = await createUser(prisma, { role: 'SALES' });
  const sales = await loginAs(app, prisma, 'SALES');
  const cid = await clientId(sales.agent, sales.csrf);
  const mine = await post(sales.agent, sales.csrf, '/projects', { ...base, clientId: cid, ownerId: rep.id });
  expect(mine.body.owner.id).toBe(sales.user.id);

  const admin = await loginAs(app, prisma, 'ADMIN');
  const assigned = await post(admin.agent, admin.csrf, '/projects', { ...base, clientId: cid, ownerId: rep.id });
  expect(assigned.body.owner.id).toBe(rep.id);
});

test('PS-4 a project cannot start ACTIVE with an undated milestone', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const cid = await clientId(agent, csrf);
  const res = await post(agent, csrf, '/projects', { ...base, clientId: cid, status: 'ACTIVE', milestones: threeMilestones });
  expect(res.status).toBe(400);
  expect(res.body.error.details).toEqual({ rule: 'PS-4' });
});

test('PS-2 creating as WON stamps wonAt', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const res = await post(agent, csrf, '/projects', { ...base, clientId: await clientId(agent, csrf), status: 'WON' });
  expect(res.body.wonAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('PS-1 status changes follow the arrows for SALES; ADMIN may jump', async () => {
  const sales = await loginAs(app, prisma, 'SALES');
  const dated = threeMilestones.map((m) => ({ ...m, dueDate: '2026-12-01' }));
  const p = await post(sales.agent, sales.csrf, '/projects', {
    ...base,
    clientId: await clientId(sales.agent, sales.csrf),
    milestones: dated,
  });
  const jump = await post(sales.agent, sales.csrf, `/projects/${p.body.id}/status`, { status: 'ACTIVE' });
  expect(jump.status).toBe(400);
  expect(jump.body.error.details).toEqual({ rule: 'PS-1' });
  expect((await post(sales.agent, sales.csrf, `/projects/${p.body.id}/status`, { status: 'PROPOSAL' })).status).toBe(200);

  const admin = await loginAs(app, prisma, 'ADMIN');
  const ok = await post(admin.agent, admin.csrf, `/projects/${p.body.id}/status`, { status: 'ACTIVE' });
  expect(ok.status).toBe(200);
  expect(ok.body).toMatchObject({ status: 'ACTIVE' });
  expect(ok.body.wonAt).not.toBeNull();
  expect(await prisma.auditLog.count({ where: { action: 'project.status', entityId: p.body.id } })).toBe(2);
});

test('PS-6 a project with payments cannot be marked LOST', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'ADMIN');
  const p = await post(agent, csrf, '/projects', {
    ...base,
    clientId: await clientId(agent, csrf),
    status: 'WON',
    milestones: threeMilestones,
  });
  const m = await prisma.milestone.findFirstOrThrow({ where: { projectId: p.body.id } });
  await prisma.payment.create({
    data: { milestoneId: m.id, milestoneLabel: 'M1', paymentDate: new Date('2026-10-01'), amountMinor: 100n, createdById: user.id },
  });
  const res = await post(agent, csrf, `/projects/${p.body.id}/status`, { status: 'LOST' });
  expect(res.status).toBe(400);
  expect(res.body.error.details).toEqual({ rule: 'PS-6' });
});

test('SALES can view but not change another rep’s project', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  const p = await post(owner.agent, owner.csrf, '/projects', { ...base, clientId: await clientId(owner.agent, owner.csrf) });
  const other = await loginAs(app, prisma, 'SALES');
  const view = await other.agent.get(`/api/v1/projects/${p.body.id}`);
  expect(view.status).toBe(200);
  expect(view.body.canEdit).toBe(false);
  const patch = await other.agent
    .patch(`/api/v1/projects/${p.body.id}`)
    .set('X-CSRF-Token', other.csrf)
    .send({ name: 'Hijacked', updatedAt: view.body.updatedAt });
  expect(patch.status).toBe(403);
  expect((await post(other.agent, other.csrf, `/projects/${p.body.id}/status`, { status: 'PROPOSAL' })).status).toBe(403);
});

test('D-1 and optimistic concurrency on update', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await post(agent, csrf, '/projects', { ...base, clientId: await clientId(agent, csrf), startDate: '2026-01-31' });
  const updated = await agent
    .patch(`/api/v1/projects/${p.body.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ durationValue: 1, durationUnit: 'MONTHS', updatedAt: p.body.updatedAt });
  expect(updated.status).toBe(200);
  expect(updated.body.endDate).toBe('2026-02-28');
  const stale = await agent
    .patch(`/api/v1/projects/${p.body.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ name: 'Again', updatedAt: p.body.updatedAt });
  expect(stale.status).toBe(409);
});

test('M-3 currency is fixed once milestones exist', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await post(agent, csrf, '/projects', { ...base, clientId: await clientId(agent, csrf), milestones: threeMilestones });
  const res = await agent
    .patch(`/api/v1/projects/${p.body.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ currency: 'USD', updatedAt: p.body.updatedAt });
  expect(res.status).toBe(400);
  expect(res.body.error.details).toEqual({ rule: 'M-3' });
});

test('list filters, computed sort and overdue flag', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'ADMIN');
  const cid = await clientId(agent, csrf);
  const overdue = await post(agent, csrf, '/projects', {
    ...base,
    name: 'Overdue one',
    clientId: cid,
    status: 'ACTIVE',
    milestones: [{ title: 'Old', amountMinor: 900, dueDate: '2020-01-01' }],
  });
  await post(agent, csrf, '/projects', {
    ...base,
    name: 'Small overdue',
    clientId: cid,
    status: 'ACTIVE',
    milestones: [{ title: 'Old', amountMinor: 100, dueDate: '2020-01-01' }],
  });
  await post(agent, csrf, '/projects', { ...base, name: 'Lead', clientId: cid });
  await prisma.project.update({ where: { id: overdue.body.id }, data: { ownerId: user.id } });

  const active = await agent.get('/api/v1/projects?status=ACTIVE,ON_HOLD&sort=outstanding&dir=desc');
  expect(active.body.items.map((p: { name: string }) => p.name)).toEqual(['Overdue one', 'Small overdue']);
  expect(active.body.items[0]).toMatchObject({ hasOverdue: true, outstandingMinor: 900 });
  const flagged = await agent.get('/api/v1/projects?hasOverdue=true');
  expect(flagged.body.total).toBe(2);
  const search = await agent.get('/api/v1/projects?q=lead');
  expect(search.body.items.map((p: { name: string }) => p.name)).toEqual(['Lead']);
});

test('CEO cannot write; SALES cannot reassign owners', async () => {
  const ceo = await loginAs(app, prisma, 'CEO');
  expect((await post(ceo.agent, ceo.csrf, '/projects', { ...base, newClient: { name: 'X' } })).status).toBe(403);
  const sales = await loginAs(app, prisma, 'SALES');
  const p = await post(sales.agent, sales.csrf, '/projects', { ...base, clientId: await clientId(sales.agent, sales.csrf) });
  const res = await sales.agent
    .patch(`/api/v1/projects/${p.body.id}/owner`)
    .set('X-CSRF-Token', sales.csrf)
    .send({ ownerId: sales.user.id });
  expect(res.status).toBe(403);
});

test('ADMIN reassigns the owner, audited', async () => {
  const sales = await loginAs(app, prisma, 'SALES');
  const p = await post(sales.agent, sales.csrf, '/projects', { ...base, clientId: await clientId(sales.agent, sales.csrf) });
  const rep = await createUser(prisma, { role: 'SALES' });
  const admin = await loginAs(app, prisma, 'ADMIN');
  const res = await admin.agent.patch(`/api/v1/projects/${p.body.id}/owner`).set('X-CSRF-Token', admin.csrf).send({ ownerId: rep.id });
  expect(res.status).toBe(200);
  expect(res.body.owner.id).toBe(rep.id);
  expect(await prisma.auditLog.count({ where: { action: 'project.owner', entityId: p.body.id } })).toBe(1);
});

test('unknown project is 404', async () => {
  const { agent } = await loginAs(app, prisma, 'ADMIN');
  expect((await agent.get('/api/v1/projects/does-not-exist')).status).toBe(404);
});

test('project activity is visible to anyone who can see the project', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  const p = await post(owner.agent, owner.csrf, '/projects', { ...base, clientId: await clientId(owner.agent, owner.csrf) });
  await post(owner.agent, owner.csrf, `/projects/${p.body.id}/status`, { status: 'PROPOSAL' });
  const other = await loginAs(app, prisma, 'SALES');
  const res = await other.agent.get(`/api/v1/projects/${p.body.id}/activity`);
  expect(res.status).toBe(200);
  expect(res.body.items.map((i: { action: string }) => i.action)).toEqual(['project.status', 'project.create']);
  expect(res.body.items[0]).toMatchObject({ actor: { id: owner.user.id }, before: { status: 'LEAD' }, after: { status: 'PROPOSAL' } });
});

test('two simultaneous edits of the same version: one wins, the other gets 409', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await post(agent, csrf, '/projects', { ...base, clientId: await clientId(agent, csrf) });
  const results = await Promise.all(
    ['First', 'Second'].map((name) =>
      agent.patch(`/api/v1/projects/${p.body.id}`).set('X-CSRF-Token', csrf).send({ name, updatedAt: p.body.updatedAt }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
});
