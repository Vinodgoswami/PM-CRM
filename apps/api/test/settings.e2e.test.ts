import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
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

test('GET /settings returns the documented defaults to any signed-in user', async () => {
  const { agent } = await loginAs(app, prisma, 'SALES');
  const res = await agent.get('/api/v1/settings');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 });
});

test('ADMIN updates settings and the change is audited with changed keys only', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'ADMIN');
  const res = await agent.patch('/api/v1/settings').set('X-CSRF-Token', csrf).send({ fyStartMonth: 1, companyName: 'Acme' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ fyStartMonth: 1, companyName: 'Acme', baseCurrency: 'INR' });

  const logs = await prisma.auditLog.findMany({ where: { action: 'settings.update' } });
  expect(logs).toHaveLength(1);
  expect(logs[0]!.actorId).toBe(user.id);
  expect(logs[0]!.before).toEqual({ fyStartMonth: 4, companyName: '' });
  expect(logs[0]!.after).toEqual({ fyStartMonth: 1, companyName: 'Acme' });
});

test.each(['CEO', 'SALES'] as const)('%s cannot update settings', async (role) => {
  const { agent, csrf } = await loginAs(app, prisma, role);
  const res = await agent.patch('/api/v1/settings').set('X-CSRF-Token', csrf).send({ fyStartMonth: 1 });
  expect(res.status).toBe(403);
});

test('invalid settings are rejected', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const res = await agent.patch('/api/v1/settings').set('X-CSRF-Token', csrf).send({ fyStartMonth: 13 });
  expect(res.status).toBe(400);
  expect(res.body.error.details[0].path).toEqual(['fyStartMonth']);
});

test('invalid timezone is rejected', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const res = await agent.patch('/api/v1/settings').set('X-CSRF-Token', csrf).send({ timezone: 'Mars/Olympus' });
  expect(res.status).toBe(400);
});
