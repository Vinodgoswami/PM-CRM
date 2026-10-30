import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, createUser, loginAs, resetDatabase } from './harness';

// D-024: project managers report to a CEO; each CEO sees and manages only their own team.
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

async function twoTeams() {
  const manish = await loginAs(app, prisma, 'CEO');
  const vikram = await createUser(prisma, { role: 'CEO', name: 'Vikram' });
  const mine = await createUser(prisma, { role: 'SALES', name: 'Meera' });
  const theirs = await createUser(prisma, { role: 'SALES', name: 'Rohan' });
  const nobodys = await createUser(prisma, { role: 'SALES', name: 'Priya' });
  await prisma.user.update({ where: { id: mine.id }, data: { managerId: manish.user.id } });
  await prisma.user.update({ where: { id: theirs.id }, data: { managerId: vikram.id } });
  await createUser(prisma, { role: 'ADMIN', name: 'Asha' });
  return { manish, vikram, mine, theirs, nobodys };
}

test('a CEO’s user list shows only their own project managers — not the Admin, other CEOs, other teams or themselves', async () => {
  const { manish } = await twoTeams();
  const items = (await manish.agent.get('/api/v1/users')).body.items as { name: string; manager: { name: string } | null }[];
  expect(items.map((u) => u.name)).toEqual(['Meera']);
});

test('the Admin sees everyone except themselves, with who each project manager reports to', async () => {
  const { manish } = await twoTeams();
  const admin = await loginAs(app, prisma, 'ADMIN');
  const items = (await admin.agent.get('/api/v1/users')).body.items as { id: string; name: string; manager: { id: string } | null }[];
  expect(items.map((u) => u.id)).not.toContain(admin.user.id);
  expect(items.find((u) => u.name === 'Meera')!.manager).toEqual({ id: manish.user.id, name: manish.user.name });
  expect(items.find((u) => u.name === 'Priya')!.manager).toBeNull();
});

test('a CEO cannot manage another team’s project manager', async () => {
  const { manish, mine, theirs } = await twoTeams();
  expect((await manish.agent.post(`/api/v1/users/${theirs.id}/reset-link`).set('X-CSRF-Token', manish.csrf)).status).toBe(403);
  expect((await manish.agent.patch(`/api/v1/users/${theirs.id}`).set('X-CSRF-Token', manish.csrf).send({ active: false })).status).toBe(
    403,
  );
  expect((await manish.agent.post(`/api/v1/users/${mine.id}/reset-link`).set('X-CSRF-Token', manish.csrf)).status).toBe(201);
});

test('the Admin assigns a project manager to a CEO; only an active CEO can be chosen', async () => {
  const { vikram, nobodys } = await twoTeams();
  const admin = await loginAs(app, prisma, 'ADMIN');
  const ok = await admin.agent.patch(`/api/v1/users/${nobodys.id}`).set('X-CSRF-Token', admin.csrf).send({ managerId: vikram.id });
  expect(ok.status).toBe(200);
  expect(ok.body.manager).toMatchObject({ id: vikram.id });
  const bad = await admin.agent.patch(`/api/v1/users/${nobodys.id}`).set('X-CSRF-Token', admin.csrf).send({ managerId: admin.user.id });
  expect(bad.status).toBe(400);
  const ceo = await loginAs(app, prisma, 'CEO');
  expect((await ceo.agent.patch(`/api/v1/users/${nobodys.id}`).set('X-CSRF-Token', ceo.csrf).send({ managerId: ceo.user.id })).status).toBe(
    403,
  );
});

test('a project manager invited by a CEO joins that CEO’s team; the Admin may choose the CEO when inviting', async () => {
  const { manish, vikram } = await twoTeams();
  const inv = await manish.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', manish.csrf)
    .send({ email: 'new@x.test', name: 'New PM', role: 'SALES' });
  await http()
    .post('/api/v1/auth/invite/accept')
    .send({ token: inv.body.url.split('/').pop(), name: 'New PM', password: 'a-long-new-password' })
    .expect(200);
  expect((await prisma.user.findUniqueOrThrow({ where: { email: 'new@x.test' } })).managerId).toBe(manish.user.id);

  const admin = await loginAs(app, prisma, 'ADMIN');
  const inv2 = await admin.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', admin.csrf)
    .send({ email: 'two@x.test', name: 'Two', role: 'SALES', managerId: vikram.id });
  expect(inv2.status).toBe(201);
  await http()
    .post('/api/v1/auth/invite/accept')
    .send({ token: inv2.body.url.split('/').pop(), name: 'Two', password: 'a-long-new-password' })
    .expect(200);
  expect((await prisma.user.findUniqueOrThrow({ where: { email: 'two@x.test' } })).managerId).toBe(vikram.id);
});

test('a CEO sees only their own pending invites', async () => {
  const { manish } = await twoTeams();
  await manish.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', manish.csrf)
    .send({ email: 'a@x.test', name: 'A', role: 'SALES' })
    .expect(201);
  const other = await loginAs(app, prisma, 'CEO');
  await other.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', other.csrf)
    .send({ email: 'b@x.test', name: 'B', role: 'SALES' })
    .expect(201);
  expect(((await manish.agent.get('/api/v1/users/invites')).body.items as { email: string }[]).map((i) => i.email)).toEqual(['a@x.test']);
});

test('a CEO picks owners and filters by their own team only, and cannot assign a project to another team', async () => {
  const { manish, mine, theirs } = await twoTeams();
  expect(((await manish.agent.get('/api/v1/owners')).body.items as { id: string }[]).map((o) => o.id)).toEqual([mine.id]);
  const res = await manish.agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', manish.csrf)
    .send({ name: 'P', expectedAmountMinor: 1000, newClient: { name: 'C' }, ownerId: theirs.id });
  expect(res.status).toBe(400);
});
