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
});
afterAll(async () => {
  await app.close();
});

// The PNG signature plus a few bytes; the server checks the declared type and size, not the pixels.
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const http = () => request(app.getHttpServer());
const pathOf = (url: string) => (url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url);

async function upload(agent: ReturnType<typeof request.agent>, csrf: string) {
  const slot = await agent
    .post('/api/v1/me/avatar/upload-url')
    .set('X-CSRF-Token', csrf)
    .send({ mimeType: 'image/png', sizeBytes: PNG.length });
  expect(slot.status).toBe(201);
  await http().put(pathOf(slot.body.url)).set('Content-Type', 'image/png').send(PNG).expect(200);
  return slot.body.key as string;
}

test('a user uploads a profile photo; their session carries its address and anyone signed in can see it', async () => {
  const me = await loginAs(app, prisma, 'SALES');
  const key = await upload(me.agent, me.csrf);
  const done = await me.agent.post('/api/v1/me/avatar').set('X-CSRF-Token', me.csrf).send({ key });
  expect(done.status).toBe(200);
  const session = (await me.agent.get('/api/v1/auth/session')).body;
  expect(session.user.avatarUrl).toMatch(new RegExp(`^/api/v1/users/${me.user.id}/avatar\\?v=[\\w-]+$`));

  const other = await loginAs(app, prisma, 'CEO');
  const redirect = await other.agent.get(session.user.avatarUrl);
  expect(redirect.status).toBe(302);
  const image = await http().get(pathOf(redirect.headers.location!));
  expect(image.status).toBe(200);
  expect(image.headers['content-type']).toBe('image/png');
  expect((await http().get(session.user.avatarUrl)).status).toBe(401);
});

test('only small JPEG, PNG or WebP images are accepted', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const ask = (body: object) => agent.post('/api/v1/me/avatar/upload-url').set('X-CSRF-Token', csrf).send(body);
  expect((await ask({ mimeType: 'application/pdf', sizeBytes: 100 })).status).toBe(400);
  expect((await ask({ mimeType: 'image/gif', sizeBytes: 100 })).status).toBe(400);
  expect((await ask({ mimeType: 'image/jpeg', sizeBytes: 3 * 1024 * 1024 })).status).toBe(400);
});

test('you cannot claim someone else’s upload, and removing your photo deletes it', async () => {
  const a = await loginAs(app, prisma, 'SALES');
  const b = await loginAs(app, prisma, 'SALES');
  const key = await upload(a.agent, a.csrf);
  expect((await b.agent.post('/api/v1/me/avatar').set('X-CSRF-Token', b.csrf).send({ key })).status).toBe(400);

  await a.agent.post('/api/v1/me/avatar').set('X-CSRF-Token', a.csrf).send({ key }).expect(200);
  expect((await a.agent.delete('/api/v1/me/avatar').set('X-CSRF-Token', a.csrf)).status).toBe(204);
  expect((await a.agent.get('/api/v1/auth/session')).body.user.avatarUrl).toBeNull();
  expect((await a.agent.get(`/api/v1/users/${a.user.id}/avatar`)).status).toBe(404);
});
