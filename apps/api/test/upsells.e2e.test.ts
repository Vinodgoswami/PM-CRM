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
const send = (agent: Agent, csrf: string, method: 'post' | 'put' | 'delete', path: string, body?: object) =>
  agent[method](`/api/v1${path}`).set('X-CSRF-Token', csrf).send(body);

async function project(agent: Agent, csrf: string, opts: { client?: string; status?: string; parentProjectId?: string } = {}) {
  const res = await send(agent, csrf, 'post', '/projects', {
    name: 'P',
    expectedAmountMinor: 100000,
    status: opts.status ?? 'WON',
    ...(opts.client ? { clientId: opts.client } : { newClient: { name: `Client ${Math.random()}` } }),
    ...(opts.parentProjectId ? { parentProjectId: opts.parentProjectId } : {}),
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body as { id: string; client: { id: string }; contractValueMinor: number };
}

test('U-1 an upsell amount raises the contract value and is audited; removing it restores it', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const p = await project(agent, csrf);
  const add = await send(agent, csrf, 'post', `/projects/${p.id}/upsells`, { amountMinor: 25000, date: '2026-10-01', note: 'Extra pages' });
  expect(add.status).toBe(201);
  expect(add.body.contractValueMinor).toBe(125000);
  expect(add.body.upsellEntries).toMatchObject([{ amountMinor: 25000, date: '2026-10-01', note: 'Extra pages' }]);
  expect(await prisma.auditLog.count({ where: { action: 'project.upsell.add', entityId: p.id } })).toBe(1);

  const entryId = add.body.upsellEntries[0].id as string;
  expect((await send(agent, csrf, 'delete', `/projects/${p.id}/upsells/${entryId}`)).status).toBe(204);
  expect((await agent.get(`/api/v1/projects/${p.id}`)).body.contractValueMinor).toBe(100000);
});

test('U-1 upsell amounts need a booked project and a date that is not in the future', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const lead = await project(agent, csrf, { status: 'LEAD' });
  const res = await send(agent, csrf, 'post', `/projects/${lead.id}/upsells`, { amountMinor: 100, date: '2026-10-01' });
  expect(res.status).toBe(400);
  expect(res.body.error.details).toEqual({ rule: 'U-1' });

  const won = await project(agent, csrf);
  expect((await send(agent, csrf, 'post', `/projects/${won.id}/upsells`, { amountMinor: 100, date: '2999-01-01' })).status).toBe(400);
  expect((await send(agent, csrf, 'post', `/projects/${won.id}/upsells`, { amountMinor: 0, date: '2026-10-01' })).status).toBe(400);
});

test('U-2 parent link: same client only, no self, no cycles; can be cleared', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const a = await project(agent, csrf);
  const b = await project(agent, csrf, { client: a.client.id });
  const stranger = await project(agent, csrf);

  const link = await send(agent, csrf, 'put', `/projects/${b.id}/parent`, { parentProjectId: a.id });
  expect(link.status).toBe(200);
  expect(link.body.parent).toMatchObject({ id: a.id });
  expect((await agent.get(`/api/v1/projects/${a.id}`)).body.upsellProjects.map((p: { id: string }) => p.id)).toEqual([b.id]);

  const cycle = await send(agent, csrf, 'put', `/projects/${a.id}/parent`, { parentProjectId: b.id });
  expect(cycle.status).toBe(400);
  expect(cycle.body.error.details).toEqual({ rule: 'U-2' });
  expect((await send(agent, csrf, 'put', `/projects/${a.id}/parent`, { parentProjectId: a.id })).status).toBe(400);
  expect((await send(agent, csrf, 'put', `/projects/${stranger.id}/parent`, { parentProjectId: a.id })).status).toBe(400);

  const cleared = await send(agent, csrf, 'put', `/projects/${b.id}/parent`, { parentProjectId: null });
  expect(cleared.status).toBe(200);
  expect(cleared.body.parent).toBeNull();
  expect(await prisma.auditLog.count({ where: { action: 'project.parent.set', entityId: b.id } })).toBe(2);
});

test('U-2 also applies when a project is created as an upsell', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const a = await project(agent, csrf);
  const child = await project(agent, csrf, { client: a.client.id, parentProjectId: a.id });
  expect((await agent.get(`/api/v1/projects/${child.id}`)).body.parent).toMatchObject({ id: a.id });

  const other = await send(agent, csrf, 'post', '/projects', {
    name: 'X',
    expectedAmountMinor: 100,
    newClient: { name: 'Elsewhere' },
    parentProjectId: a.id,
  });
  expect(other.status).toBe(400);
  expect(other.body.error.details).toEqual({ rule: 'U-2' });
});

test('only the owner, the CEO (D-018) or Admin change upsells', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  const p = await project(owner.agent, owner.csrf);
  const other = await loginAs(app, prisma, 'SALES');
  expect((await send(other.agent, other.csrf, 'post', `/projects/${p.id}/upsells`, { amountMinor: 100, date: '2026-10-01' })).status).toBe(
    403,
  );
  expect((await send(other.agent, other.csrf, 'put', `/projects/${p.id}/parent`, { parentProjectId: null })).status).toBe(403);
  const ceo = await loginAs(app, prisma, 'CEO');
  expect((await send(ceo.agent, ceo.csrf, 'post', `/projects/${p.id}/upsells`, { amountMinor: 100, date: '2026-10-01' })).status).toBe(201);
  const admin = await loginAs(app, prisma, 'ADMIN');
  expect((await send(admin.agent, admin.csrf, 'post', `/projects/${p.id}/upsells`, { amountMinor: 100, date: '2026-10-01' })).status).toBe(
    201,
  );
});
