import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, loginAs, resetDatabase } from './harness';

// D-071: a phase created under the wrong project can be moved to another project of the same client.
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
const post = (a: Agent, csrf: string, body: object) => a.post('/api/v1/projects').set('X-CSRF-Token', csrf).send(body);
const base = { expectedAmountMinor: 1000, status: 'ACTIVE' };

test('a phase moves to another project of the same client', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const volterra = (await post(agent, csrf, { ...base, name: 'Volterra', newClient: { name: 'Shakil, Luwei' } })).body;
  const padeliv = (await post(agent, csrf, { ...base, name: 'Padeliv', clientId: volterra.client.id })).body;
  const phase = (await post(agent, csrf, { ...base, name: 'Computer Vision', clientId: volterra.client.id, parentProjectId: volterra.id }))
    .body;
  const moved = await agent
    .patch(`/api/v1/projects/${phase.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ parentProjectId: padeliv.id, updatedAt: phase.updatedAt });
  expect(moved.status).toBe(200);
  expect(moved.body.parent).toMatchObject({ id: padeliv.id });
  const get = async (id: string) => (await agent.get(`/api/v1/projects/${id}`)).body;
  expect((await get(padeliv.id)).upsellProjects.map((u: { id: string }) => u.id)).toEqual([phase.id]);
  expect((await get(volterra.id)).upsellProjects).toEqual([]);
  expect(await prisma.auditLog.count({ where: { action: 'project.update', entityId: phase.id } })).toBe(1);
});

test('a phase cannot move to another client, and a project that is not a phase is not moved', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const a = (await post(agent, csrf, { ...base, name: 'A', newClient: { name: 'Client A' } })).body;
  const other = (await post(agent, csrf, { ...base, name: 'Other', newClient: { name: 'Client B' } })).body;
  const phase = (await post(agent, csrf, { ...base, name: 'Phase', clientId: a.client.id, parentProjectId: a.id })).body;
  const cross = await agent
    .patch(`/api/v1/projects/${phase.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ parentProjectId: other.id, updatedAt: phase.updatedAt });
  expect([cross.status, cross.body.error.details]).toEqual([400, { rule: 'U-2' }]);
  const notPhase = await agent
    .patch(`/api/v1/projects/${other.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ parentProjectId: a.id, updatedAt: other.updatedAt });
  expect([notPhase.status, notPhase.body.error.details]).toEqual([400, { rule: 'U-4' }]);
});
