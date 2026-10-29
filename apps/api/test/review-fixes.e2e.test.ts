import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createTestApp, createUser, loginAs, resetDatabase } from './harness';

let app: INestApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
});
beforeEach(async () => {
  await resetDatabase(prisma);
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());
const tokenFrom = (url: string) => url.split('/').pop()!;

test('a parallel burst of wrong passwords cannot exceed the 5-failure limit', async () => {
  const user = await createUser(prisma, { role: 'SALES' });
  const results = await Promise.all(
    Array.from({ length: 8 }, () => http().post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-password-1' })),
  );
  const statuses = results.map((r) => r.status).sort();
  expect(statuses.filter((s) => s === 401)).toHaveLength(5);
  expect(statuses.filter((s) => s === 429)).toHaveLength(3);
});

test('two admins deactivating each other at once leave one active admin', async () => {
  const a = await loginAs(app, prisma, 'ADMIN');
  const b = await loginAs(app, prisma, 'ADMIN');
  const [ra, rb] = await Promise.all([
    a.agent.patch(`/api/v1/users/${b.user.id}`).set('X-CSRF-Token', a.csrf).send({ active: false }),
    b.agent.patch(`/api/v1/users/${a.user.id}`).set('X-CSRF-Token', b.csrf).send({ active: false }),
  ]);
  expect([ra.status, rb.status].sort()).toEqual([200, 409]);
  expect(await prisma.user.count({ where: { role: 'ADMIN', active: true } })).toBe(1);
});

test('an invite dies when its issuing admin is deactivated', async () => {
  const issuer = await loginAs(app, prisma, 'ADMIN');
  const other = await loginAs(app, prisma, 'ADMIN');
  const invite = await issuer.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', issuer.csrf)
    .send({ email: 'alt@example.com', name: 'Alt', role: 'ADMIN' });
  await other.agent.patch(`/api/v1/users/${issuer.user.id}`).set('X-CSRF-Token', other.csrf).send({ active: false }).expect(200);

  const accept = await http()
    .post('/api/v1/auth/invite/accept')
    .send({ token: tokenFrom(invite.body.url), name: 'Alt', password: 'a-brand-new-password' });
  expect(accept.status).toBe(400);
  expect(await prisma.user.count({ where: { email: 'alt@example.com' } })).toBe(0);
});

test('a reset link dies when its issuer loses the admin role', async () => {
  const issuer = await loginAs(app, prisma, 'ADMIN');
  const other = await loginAs(app, prisma, 'ADMIN');
  const target = await createUser(prisma, { role: 'SALES' });
  const link = await issuer.agent.post(`/api/v1/users/${target.id}/reset-link`).set('X-CSRF-Token', issuer.csrf);
  await other.agent.patch(`/api/v1/users/${issuer.user.id}`).set('X-CSRF-Token', other.csrf).send({ role: 'SALES' }).expect(200);

  const reset = await http()
    .post('/api/v1/auth/password/reset')
    .send({ token: tokenFrom(link.body.url), password: 'a-brand-new-password' });
  expect(reset.status).toBe(400);
});

test.each([
  ['/api/v1/auth/invite/accept', { token: 'junk-token', name: 'X', password: 'a-brand-new-password' }],
  ['/api/v1/auth/password/reset', { token: 'junk-token', password: 'a-brand-new-password' }],
])('%s rejects an invalid token before hashing the password', async (path, body) => {
  const hash = vi.spyOn(argon2, 'hash');
  const res = await http().post(path).send(body);
  expect(res.status).toBe(400);
  expect(hash).not.toHaveBeenCalled();
});
