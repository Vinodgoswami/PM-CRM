import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
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

test('the CEO gets the active people who can own projects, sorted by name', async () => {
  await createUser(prisma, { role: 'SALES', name: 'Zara Sales' });
  await createUser(prisma, { role: 'SALES', name: 'Old Rep', active: false });
  const { agent, user } = await loginAs(app, prisma, 'CEO');
  const admin = await createUser(prisma, { role: 'ADMIN', name: 'Asha Admin' });
  const res = await agent.get('/api/v1/owners');
  expect(res.status).toBe(200);
  expect(res.body.items).toEqual([
    { id: admin.id, name: 'Asha Admin' },
    { id: expect.any(String), name: 'Zara Sales' },
  ]);
  expect(res.body.items.map((o: { id: string }) => o.id)).not.toContain(user.id);
});

test('SALES cannot list owners', async () => {
  const { agent } = await loginAs(app, prisma, 'SALES');
  expect((await agent.get('/api/v1/owners')).status).toBe(403);
});
