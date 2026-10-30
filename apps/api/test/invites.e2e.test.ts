import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, loginAs, resetDatabase } from './harness';

let app: INestApplication;
let prisma: PrismaClient;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
});
beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.setting.upsert({
    where: { id: 1 },
    update: { companyName: 'ChicMic Studios' },
    create: { id: 1, companyName: 'ChicMic Studios' },
  });
});
afterAll(async () => {
  await app.close();
});
const http = () => request(app.getHttpServer());
const tokenOf = (url: string) => url.split('/').pop()!;

async function invite(role = 'CEO', email = 'vikram@x.test') {
  const admin = await loginAs(app, prisma, 'ADMIN');
  const res = await admin.agent.post('/api/v1/users/invite').set('X-CSRF-Token', admin.csrf).send({ email, name: 'Vikram Shah', role });
  expect(res.status).toBe(201);
  return { admin, url: res.body.url as string };
}

test('an invite link tells the invitee who they are invited as, without signing in', async () => {
  const { url } = await invite();
  const res = await http().get(`/api/v1/auth/invite/${tokenOf(url)}`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ email: 'vikram@x.test', name: 'Vikram Shah', role: 'CEO', companyName: 'ChicMic Studios' });
  expect((await http().get('/api/v1/auth/invite/not-a-real-token')).status).toBe(400);
});

test('pending invites are listed until accepted; they can be resent or cancelled', async () => {
  const { admin, url } = await invite();
  const list = await admin.agent.get('/api/v1/users/invites');
  expect(list.status).toBe(200);
  expect(list.body.items).toEqual([expect.objectContaining({ email: 'vikram@x.test', name: 'Vikram Shah', role: 'CEO' })]);
  const id = list.body.items[0].id as string;

  const resent = await admin.agent.post(`/api/v1/users/invites/${id}/resend`).set('X-CSRF-Token', admin.csrf);
  expect(resent.status).toBe(201);
  expect(resent.body.url).not.toBe(url);
  expect((await http().get(`/api/v1/auth/invite/${tokenOf(url)}`)).status).toBe(400); // the old link stops working
  expect((await http().get(`/api/v1/auth/invite/${tokenOf(resent.body.url)}`)).status).toBe(200);

  const pending = (await admin.agent.get('/api/v1/users/invites')).body.items;
  expect(pending).toHaveLength(1);
  expect((await admin.agent.delete(`/api/v1/users/invites/${pending[0].id}`).set('X-CSRF-Token', admin.csrf)).status).toBe(204);
  expect((await admin.agent.get('/api/v1/users/invites')).body.items).toEqual([]);
  expect((await http().get(`/api/v1/auth/invite/${tokenOf(resent.body.url)}`)).status).toBe(400);
});

test('accepting removes the invite from the pending list; inviting the same email again replaces the old link', async () => {
  const { admin, url } = await invite();
  const again = await admin.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', admin.csrf)
    .send({ email: 'vikram@x.test', name: 'Vikram', role: 'CEO' });
  expect(again.status).toBe(201);
  expect((await http().get(`/api/v1/auth/invite/${tokenOf(url)}`)).status).toBe(400);
  expect((await admin.agent.get('/api/v1/users/invites')).body.items).toHaveLength(1);

  await http()
    .post('/api/v1/auth/invite/accept')
    .send({ token: tokenOf(again.body.url), name: 'Vikram Shah', password: 'a-long-new-password' })
    .expect(200);
  expect((await admin.agent.get('/api/v1/users/invites')).body.items).toEqual([]);
});

test('the CEO sees and manages only invites for project managers', async () => {
  await invite('CEO', 'boss@x.test');
  const ceo = await loginAs(app, prisma, 'CEO');
  await ceo.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', ceo.csrf)
    .send({ email: 'pm@x.test', name: 'PM', role: 'SALES' })
    .expect(201);
  const items = (await ceo.agent.get('/api/v1/users/invites')).body.items as { email: string; id: string }[];
  expect(items.map((i) => i.email)).toEqual(['pm@x.test']);
});
