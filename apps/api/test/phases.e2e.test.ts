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
