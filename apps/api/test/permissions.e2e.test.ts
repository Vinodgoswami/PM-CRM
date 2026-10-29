import { Controller, Get, type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, loginAs, resetDatabase } from './harness';

@Controller('test-undecorated')
class UndecoratedController {
  @Get()
  secret() {
    return { leaked: true };
  }
}

let app: INestApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp({}, [UndecoratedController]));
});
beforeEach(async () => {
  await resetDatabase(prisma);
});
afterAll(async () => {
  await app.close();
});

test('a route without a permission decorator is denied even to ADMIN', async () => {
  const { agent } = await loginAs(app, prisma, 'ADMIN');
  const res = await agent.get('/api/v1/test-undecorated');
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('FORBIDDEN');
});

test.each([
  ['ADMIN', 200],
  ['CEO', 200],
  ['SALES', 403],
] as const)('GET /audit as %s → %i', async (role, status) => {
  const { agent } = await loginAs(app, prisma, role);
  expect((await agent.get('/api/v1/audit')).status).toBe(status);
});

test('GET /audit without a session → 401', async () => {
  expect((await request(app.getHttpServer()).get('/api/v1/audit')).status).toBe(401);
});
