import { type INestApplication } from '@nestjs/common';
import { hashToken } from '@salescrm/auth';
import { type PrismaClient } from '@salescrm/database';
import { sessionResponseSchema } from '@salescrm/schemas';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, createUser, loginAs, resetDatabase, TEST_PASSWORD } from './harness';
import { testConfig } from './test-config';

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

const http = () => request(app.getHttpServer());
const sessionCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sc_session=')) ?? '';

test('login sets an httpOnly session cookie', async () => {
  const user = await createUser(prisma, { role: 'ADMIN' });
  const res = await http().post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  const cookie = sessionCookie(res);
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Lax');
  expect(cookie).toContain('Path=/');
  expect(sessionResponseSchema.parse(res.body).user.email).toBe(user.email);
});

test('login normalises email case and spaces', async () => {
  await createUser(prisma, { role: 'ADMIN', email: 'admin@example.com' });
  const res = await http().post('/api/v1/auth/login').send({ email: ' Admin@Example.com ', password: TEST_PASSWORD });
  expect(res.status).toBe(200);
});

test('wrong password, unknown email and inactive user give the same 401', async () => {
  const active = await createUser(prisma, { role: 'SALES' });
  const inactive = await createUser(prisma, { role: 'SALES', active: false });
  const attempts = [
    { email: active.email, password: 'wrong-password-1' },
    { email: 'nobody@example.com', password: TEST_PASSWORD },
    { email: inactive.email, password: TEST_PASSWORD },
  ];
  for (const body of attempts) {
    const res = await http().post('/api/v1/auth/login').send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'UNAUTHENTICATED', message: 'Invalid email or password' });
  }
});

test('rate limit after 5 failures', async () => {
  const user = await createUser(prisma, { role: 'SALES' });
  for (let i = 0; i < 5; i++) {
    const res = await http().post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-password-1' });
    expect(res.status).toBe(401);
  }
  const res = await http().post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  expect(res.status).toBe(429);
  expect(res.body.error.code).toBe('RATE_LIMITED');
});

test('CSRF token required on authenticated mutations', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  expect((await agent.post('/api/v1/auth/logout')).status).toBe(403);
  expect((await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', 'nope')).status).toBe(403);
  expect((await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf)).status).toBe(204);
});

test('login from a foreign origin is refused', async () => {
  const user = await createUser(prisma, { role: 'ADMIN' });
  const res = await http()
    .post('/api/v1/auth/login')
    .set('Origin', 'https://evil.test')
    .send({ email: user.email, password: TEST_PASSWORD });
  expect(res.status).toBe(403);
});

test('idle and absolute expiry end the session', async () => {
  const { agent, user } = await loginAs(app, prisma, 'SALES');
  expect((await agent.get('/api/v1/auth/session')).status).toBe(200);

  await prisma.session.updateMany({ where: { userId: user.id }, data: { lastSeenAt: new Date(Date.now() - 13 * 3600_000) } });
  expect((await agent.get('/api/v1/auth/session')).status).toBe(401);

  const second = await loginAs(app, prisma, 'SALES');
  await prisma.session.updateMany({ where: { userId: second.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await second.agent.get('/api/v1/auth/session')).status).toBe(401);
});

test('logout revokes the session', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf).expect(204);
  expect((await agent.get('/api/v1/auth/session')).status).toBe(401);
});

test('session token is stored hashed', async () => {
  const user = await createUser(prisma, { role: 'ADMIN' });
  const res = await http().post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  const raw = sessionCookie(res).split(';')[0]!.slice('sc_session='.length);
  const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
  expect(session.tokenHash).not.toBe(raw);
  expect(session.tokenHash).toBe(hashToken(raw, testConfig().sessionSecret));
});

test('unauthenticated session request is 401', async () => {
  const res = await http().get('/api/v1/auth/session');
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe('UNAUTHENTICATED');
});
