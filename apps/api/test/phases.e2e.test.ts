import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, loginAs, resetDatabase } from './harness';

// D-028: upsell work is added as numbered phases of the original project (Phase 1), each with its own booking.
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

test('D-028 phases are numbered from the original project and carry their own booking', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const create = (body: object) =>
    agent
      .post('/api/v1/projects')
      .set('X-CSRF-Token', csrf)
      .send({ status: 'ACTIVE', ...body })
      .expect(201);
  const root = await create({ name: 'App', expectedAmountMinor: 1000, newClient: { name: 'Phase Co' } });
  const clientId = root.body.client.id as string;
  const p2 = await create({ name: 'App phase 2', expectedAmountMinor: 300, clientId, parentProjectId: root.body.id });
  const p3 = await create({ name: 'App phase 3', expectedAmountMinor: 200, clientId, parentProjectId: root.body.id });

  const parent = (await agent.get(`/api/v1/projects/${root.body.id}`)).body;
  expect(parent.phase).toBe(1);
  expect(parent.upsellProjects).toMatchObject([
    { id: p2.body.id, phase: 2, expectedAmountMinor: 300, contractValueMinor: 300, collectedMinor: 0 },
    { id: p3.body.id, phase: 3, expectedAmountMinor: 200, contractValueMinor: 200 },
  ]);
  expect((await agent.get(`/api/v1/projects/${p3.body.id}`)).body).toMatchObject({ phase: 3, parent: { id: root.body.id } });

  const alone = await create({ name: 'Solo', expectedAmountMinor: 50, clientId });
  expect(alone.body.phase).toBeNull();
});

test('D-037 a phase is either an upsell or a part of the original scope, and only upsells count as upsell', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const create = (body: object) =>
    agent
      .post('/api/v1/projects')
      .set('X-CSRF-Token', csrf)
      .send({ status: 'ACTIVE', ...body });
  const root = (await create({ name: 'App', expectedAmountMinor: 1000, newClient: { name: 'Kind Co' } }).expect(201)).body;
  const clientId = root.client.id as string;
  const scope = (
    await create({ name: 'App phase 2', expectedAmountMinor: 300, clientId, parentProjectId: root.id, phaseKind: 'SCOPE' }).expect(201)
  ).body;
  await create({ name: 'App phase 3', expectedAmountMinor: 200, clientId, parentProjectId: root.id }).expect(201); // upsell by default

  const parent = (await agent.get(`/api/v1/projects/${root.id}`)).body;
  expect(parent.upsellProjects.map((u: { phase: number; phaseKind: string }) => [u.phase, u.phaseKind])).toEqual([
    [2, 'SCOPE'],
    [3, 'UPSELL'],
  ]);
  expect((await agent.get(`/api/v1/projects/${scope.id}`)).body).toMatchObject({ phase: 2, phaseKind: 'SCOPE' });

  const d = (await agent.get('/api/v1/dashboard?period=ALL')).body;
  expect(d.kpis).toMatchObject({ bookedMinor: 1500, upsellMinor: 200 }); // the scope part is initial booking

  // The type can be corrected later; a project that is not a phase has none.
  const fresh = (await agent.get(`/api/v1/projects/${scope.id}`)).body;
  await agent
    .patch(`/api/v1/projects/${scope.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ phaseKind: 'UPSELL', updatedAt: fresh.updatedAt })
    .expect(200);
  expect((await agent.get('/api/v1/dashboard?period=ALL')).body.kpis.upsellMinor).toBe(500);
  expect(root.phaseKind ?? null).toBeNull();
  expect((await create({ name: 'Solo', expectedAmountMinor: 10, clientId, phaseKind: 'SCOPE' })).status).toBe(400);
});

test('D-038 an upsell amount with a due date becomes its own Upsell milestone; removing it removes the unpaid milestone', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const root = (
    await agent
      .post('/api/v1/projects')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'App',
        expectedAmountMinor: 1000,
        status: 'ACTIVE',
        newClient: { name: 'U Co' },
        milestones: [{ title: 'Build', amountMinor: 1000, dueDate: '2026-12-01' }],
      })
      .expect(201)
  ).body;
  const today = new Date().toISOString().slice(0, 10);
  const withUpsell = (
    await agent
      .post(`/api/v1/projects/${root.id}/upsells`)
      .set('X-CSRF-Token', csrf)
      .send({ amountMinor: 400, date: today, note: 'Computer vision', dueDate: '2026-12-20' })
      .expect(201)
  ).body;
  expect(withUpsell.milestones.map((m: { number: number; title: string; isUpsell: boolean }) => [m.number, m.title, m.isUpsell])).toEqual([
    [1, 'Build', false],
    [2, 'Computer vision', true],
  ]);
  expect(withUpsell).toMatchObject({ contractValueMinor: 1400, unscheduledMinor: 0 });
  const entry = withUpsell.upsellEntries[0];
  expect(entry.milestoneId).toBe(withUpsell.milestones[1].id);

  await agent.delete(`/api/v1/projects/${root.id}/upsells/${entry.id}`).set('X-CSRF-Token', csrf).expect(204);
  const after = (await agent.get(`/api/v1/projects/${root.id}`)).body;
  expect(after.milestones.map((m: { title: string }) => m.title)).toEqual(['Build']);
});

test('D-038 milestones of an upsell phase are marked Upsell; a scope part’s are not', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const create = (body: object) =>
    agent
      .post('/api/v1/projects')
      .set('X-CSRF-Token', csrf)
      .send({ status: 'ACTIVE', ...body })
      .expect(201);
  const root = (await create({ name: 'App', expectedAmountMinor: 1000, newClient: { name: 'P Co' } })).body;
  const m = [{ title: 'Part', amountMinor: 100, dueDate: '2026-12-01' }];
  const up = (await create({ name: 'P2', expectedAmountMinor: 100, clientId: root.client.id, parentProjectId: root.id, milestones: m }))
    .body;
  const scope = (
    await create({
      name: 'P3',
      expectedAmountMinor: 100,
      clientId: root.client.id,
      parentProjectId: root.id,
      phaseKind: 'SCOPE',
      milestones: m,
    })
  ).body;
  expect(up.milestones[0].isUpsell).toBe(true);
  expect(scope.milestones[0].isUpsell).toBe(false);
});
