import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, createUser, loginAs, resetDatabase, TEST_PASSWORD } from './harness';

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
const tokenFrom = (url: string) => url.split('/').pop()!;
const NEW_PASSWORD = 'a-brand-new-password';

test('admin invites, invitee accepts and is logged in as that role', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const invite = await agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', csrf)
    .send({ email: 'New.Rep@Example.com', name: 'New Rep', role: 'SALES' });
  expect(invite.status).toBe(201);
  expect(invite.body.url).toMatch(/^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]{43}$/);

  const invitee = request.agent(app.getHttpServer());
  const accept = await invitee
    .post('/api/v1/auth/invite/accept')
    .send({ token: tokenFrom(invite.body.url), name: 'Rep', password: NEW_PASSWORD });
  expect(accept.status).toBe(200);
  expect(accept.body.user).toMatchObject({ email: 'new.rep@example.com', role: 'SALES', name: 'Rep' });
  expect((await invitee.get('/api/v1/auth/session')).status).toBe(200);
});

test('invite token is single use and expires', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const first = await agent.post('/api/v1/users/invite').set('X-CSRF-Token', csrf).send({ email: 'a@example.com', name: 'A', role: 'CEO' });
  const token = tokenFrom(first.body.url);
  expect((await http().post('/api/v1/auth/invite/accept').send({ token, name: 'A', password: NEW_PASSWORD })).status).toBe(200);
  const reused = await http().post('/api/v1/auth/invite/accept').send({ token, name: 'A', password: NEW_PASSWORD });
  expect(reused.status).toBe(400);
  expect(reused.body.error.code).toBe('VALIDATION_FAILED');

  const second = await agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', csrf)
    .send({ email: 'b@example.com', name: 'B', role: 'CEO' });
  await prisma.authToken.updateMany({ where: { email: 'b@example.com' }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await http()
    .post('/api/v1/auth/invite/accept')
    .send({ token: tokenFrom(second.body.url), name: 'B', password: NEW_PASSWORD });
  expect(expired.status).toBe(400);
});

test('inviting an existing email is a conflict', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const existing = await createUser(prisma, { role: 'SALES' });
  const res = await agent.post('/api/v1/users/invite').set('X-CSRF-Token', csrf).send({ email: existing.email, name: 'X', role: 'SALES' });
  expect(res.status).toBe(409);
});

test('a Project Manager cannot manage users', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const other = await createUser(prisma, { role: 'SALES' });
  expect(
    (await agent.post('/api/v1/users/invite').set('X-CSRF-Token', csrf).send({ email: 'z@example.com', name: 'Z', role: 'SALES' })).status,
  ).toBe(403);
  expect((await agent.get('/api/v1/users')).status).toBe(403);
  expect((await agent.patch(`/api/v1/users/${other.id}`).set('X-CSRF-Token', csrf).send({ active: false })).status).toBe(403);
  expect((await agent.post(`/api/v1/users/${other.id}/reset-link`).set('X-CSRF-Token', csrf)).status).toBe(403);
});

test('admin lists users without password hashes', async () => {
  const { agent } = await loginAs(app, prisma, 'ADMIN');
  await createUser(prisma, { role: 'CEO' });
  const res = await agent.get('/api/v1/users');
  expect(res.status).toBe(200);
  expect(res.body.items).toHaveLength(2);
  expect(JSON.stringify(res.body)).not.toContain('passwordHash');
});

test('deactivated user loses access immediately', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  const sales = await loginAs(app, prisma, 'SALES');
  await admin.agent.patch(`/api/v1/users/${sales.user.id}`).set('X-CSRF-Token', admin.csrf).send({ active: false }).expect(200);
  expect((await sales.agent.get('/api/v1/auth/session')).status).toBe(401);
});

test('role change ends sessions and the new role applies on next login', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  const sales = await loginAs(app, prisma, 'SALES');
  await admin.agent.patch(`/api/v1/users/${sales.user.id}`).set('X-CSRF-Token', admin.csrf).send({ role: 'CEO' }).expect(200);
  expect((await sales.agent.get('/api/v1/auth/session')).status).toBe(401);
  const again = await http().post('/api/v1/auth/login').send({ email: sales.user.email, password: TEST_PASSWORD });
  expect(again.body.user.role).toBe('CEO');
});

test('the last active admin cannot demote or deactivate themself', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  for (const body of [{ role: 'SALES' }, { active: false }]) {
    const res = await admin.agent.patch(`/api/v1/users/${admin.user.id}`).set('X-CSRF-Token', admin.csrf).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
  }
  await createUser(prisma, { role: 'ADMIN' });
  const ok = await admin.agent.patch(`/api/v1/users/${admin.user.id}`).set('X-CSRF-Token', admin.csrf).send({ role: 'SALES' });
  expect(ok.status).toBe(200);
});

test('reset link sets a new password and revokes sessions', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  const sales = await loginAs(app, prisma, 'SALES');
  const link = await admin.agent.post(`/api/v1/users/${sales.user.id}/reset-link`).set('X-CSRF-Token', admin.csrf);
  expect(link.status).toBe(201);
  expect(link.body.url).toMatch(/\/reset\/[A-Za-z0-9_-]{43}$/);

  const reset = await http()
    .post('/api/v1/auth/password/reset')
    .send({ token: tokenFrom(link.body.url), password: NEW_PASSWORD });
  expect(reset.status).toBe(204);
  expect((await sales.agent.get('/api/v1/auth/session')).status).toBe(401);
  expect((await http().post('/api/v1/auth/login').send({ email: sales.user.email, password: TEST_PASSWORD })).status).toBe(401);
  expect((await http().post('/api/v1/auth/login').send({ email: sales.user.email, password: NEW_PASSWORD })).status).toBe(200);
});

test('user changes are audited', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  const target = await createUser(prisma, { role: 'SALES' });
  await admin.agent.patch(`/api/v1/users/${target.id}`).set('X-CSRF-Token', admin.csrf).send({ role: 'CEO' }).expect(200);
  const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.update', entityId: target.id } });
  expect(log.actorId).toBe(admin.user.id);
  expect(log.before).toEqual({ role: 'SALES' });
  expect(log.after).toEqual({ role: 'CEO' });
});

test('D-018 the CEO invites and manages Project Managers, and nobody else', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  const invite = (role: string, email: string) =>
    agent.post('/api/v1/users/invite').set('X-CSRF-Token', csrf).send({ email, name: 'N', role });
  expect((await invite('SALES', 'pm@example.com')).status).toBe(201);
  expect((await invite('CEO', 'ceo2@example.com')).status).toBe(403);
  expect((await invite('ADMIN', 'admin2@example.com')).status).toBe(403);

  const pm = await createUser(prisma, { role: 'SALES' });
  const admin = await createUser(prisma, { role: 'ADMIN' });
  expect((await agent.get('/api/v1/users')).status).toBe(200);
  expect((await agent.post(`/api/v1/users/${pm.id}/reset-link`).set('X-CSRF-Token', csrf)).status).toBe(201);
  expect((await agent.patch(`/api/v1/users/${pm.id}`).set('X-CSRF-Token', csrf).send({ active: false })).status).toBe(200);
  expect((await agent.patch(`/api/v1/users/${pm.id}`).set('X-CSRF-Token', csrf).send({ role: 'ADMIN' })).status).toBe(403);
  expect((await agent.patch(`/api/v1/users/${admin.id}`).set('X-CSRF-Token', csrf).send({ active: false })).status).toBe(403);
  expect((await agent.post(`/api/v1/users/${admin.id}/reset-link`).set('X-CSRF-Token', csrf)).status).toBe(403);
});

test('D-018 the Admin creates CEOs', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const res = await agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', csrf)
    .send({ email: 'boss@example.com', name: 'Boss', role: 'CEO' });
  expect(res.status).toBe(201);
});

test('D-018 a Project Manager invited by the CEO can accept; the link dies if the CEO is deactivated', async () => {
  const ceo = await loginAs(app, prisma, 'CEO');
  const invite = (email: string) =>
    ceo.agent.post('/api/v1/users/invite').set('X-CSRF-Token', ceo.csrf).send({ email, name: 'PM', role: 'SALES' });
  const first = await invite('pm1@example.com');
  const accepted = await http()
    .post('/api/v1/auth/invite/accept')
    .send({ token: tokenFrom(first.body.url), name: 'Rohan', password: NEW_PASSWORD });
  expect(accepted.status).toBe(200);
  expect(accepted.body.user).toMatchObject({ role: 'SALES', name: 'Rohan' });

  const second = await invite('pm2@example.com');
  const admin = await loginAs(app, prisma, 'ADMIN');
  await admin.agent.patch(`/api/v1/users/${ceo.user.id}`).set('X-CSRF-Token', admin.csrf).send({ active: false }).expect(200);
  const late = await http()
    .post('/api/v1/auth/invite/accept')
    .send({ token: tokenFrom(second.body.url), name: 'Meera', password: NEW_PASSWORD });
  expect(late.status).toBe(400);
});

test('D-018 a CEO-issued link can never create anything but a Project Manager', async () => {
  const ceo = await loginAs(app, prisma, 'CEO');
  // Forge the situation directly: a token minted by a CEO for an ADMIN account must not be usable.
  const link = await ceo.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', ceo.csrf)
    .send({ email: 'x@example.com', name: 'X', role: 'SALES' });
  await prisma.authToken.updateMany({ where: { email: 'x@example.com' }, data: { role: 'ADMIN' } });
  const res = await http()
    .post('/api/v1/auth/invite/accept')
    .send({ token: tokenFrom(link.body.url), name: 'X', password: NEW_PASSWORD });
  expect(res.status).toBe(400);
});
