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

test('SALES creates a client with a primary contact, audited', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'SALES');
  const res = await agent
    .post('/api/v1/clients')
    .set('X-CSRF-Token', csrf)
    .send({ name: '  Acme Corp ', company: 'Acme Pvt Ltd', contact: { name: 'Riya', email: 'Riya@Acme.test' } });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: 'Acme Corp', primaryEmail: 'riya@acme.test', projects: 0, archived: false });
  const contacts = await prisma.clientContact.findMany({ where: { clientId: res.body.id } });
  expect(contacts).toMatchObject([{ email: 'riya@acme.test', isPrimary: true }]);
  expect(await prisma.auditLog.count({ where: { action: 'client.create', actorId: user.id } })).toBe(1);
});

test('C-2 duplicate active names conflict and return the existing id', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const first = await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Acme' });
  const dup = await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: ' acme ' });
  expect(dup.status).toBe(409);
  expect(dup.body.error).toMatchObject({ code: 'CONFLICT', details: { clientId: first.body.id } });
});

test('C-2 concurrent duplicate creates leave exactly one client', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const results = await Promise.all([
    agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Acme' }),
    agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'ACME' }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await prisma.client.count()).toBe(1);
});

test('C-3 archiving hides the client and frees its name', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const client = await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Acme' });
  expect((await agent.post(`/api/v1/clients/${client.body.id}/archive`).set('X-CSRF-Token', csrf)).status).toBe(200);
  expect((await agent.get('/api/v1/clients')).body.items).toHaveLength(0);
  expect((await agent.get('/api/v1/clients?includeArchived=true')).body.items).toHaveLength(1);
  expect((await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Acme' })).status).toBe(201);
});

test('list search matches name and company, case-insensitively', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Acme', company: 'Rocket Works' });
  await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Bluepeak' });
  expect((await agent.get('/api/v1/clients?q=ACM')).body.items.map((c: { name: string }) => c.name)).toEqual(['Acme']);
  expect((await agent.get('/api/v1/clients?q=rocket')).body.items.map((c: { name: string }) => c.name)).toEqual(['Acme']);
  expect((await agent.get('/api/v1/clients')).body.total).toBe(2);
});

test('renaming to an existing name conflicts; editing fields is audited', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const a = await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Acme' });
  await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Bluepeak' });
  expect((await agent.patch(`/api/v1/clients/${a.body.id}`).set('X-CSRF-Token', csrf).send({ name: 'bluepeak' })).status).toBe(409);
  const ok = await agent.patch(`/api/v1/clients/${a.body.id}`).set('X-CSRF-Token', csrf).send({ notes: 'Pays late' });
  expect(ok.status).toBe(200);
  expect(await prisma.auditLog.count({ where: { action: 'client.update', entityId: a.body.id } })).toBe(1);
});

test('contacts: add, make primary (only one primary remains)', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const c = await agent
    .post('/api/v1/clients')
    .set('X-CSRF-Token', csrf)
    .send({ name: 'Acme', contact: { email: 'one@acme.test' } });
  const added = await agent.post(`/api/v1/clients/${c.body.id}/contacts`).set('X-CSRF-Token', csrf).send({ email: 'two@acme.test' });
  expect(added.status).toBe(201);
  await agent
    .patch(`/api/v1/clients/${c.body.id}/contacts/${added.body.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ isPrimary: true })
    .expect(200);
  const primaries = await prisma.clientContact.findMany({ where: { clientId: c.body.id, isPrimary: true } });
  expect(primaries.map((p) => p.email)).toEqual(['two@acme.test']);
});

test('detail returns contacts, projects and money totals', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'ADMIN');
  const c = await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Acme' });
  const project = await prisma.project.create({
    data: {
      code: 'PRJ-0001',
      name: 'Website',
      description: 'x',
      clientId: c.body.id,
      ownerId: user.id,
      status: 'ACTIVE',
      expectedAmountMinor: 100000n,
      currency: 'INR',
      wonAt: new Date('2026-01-10'),
      createdById: user.id,
      milestones: {
        create: [
          { number: 1, title: 'Design', amountMinor: 60000n, dueDate: new Date('2026-02-01'), createdById: user.id },
          { number: 2, title: 'Build', amountMinor: 40000n, dueDate: new Date('2099-01-01'), createdById: user.id },
        ],
      },
    },
    include: { milestones: true },
  });
  await prisma.payment.create({
    data: {
      milestoneId: project.milestones[0]!.id,
      milestoneLabel: 'M1',
      paymentDate: new Date('2026-02-05'),
      amountMinor: 20000n,
      createdById: user.id,
    },
  });
  const res = await agent.get(`/api/v1/clients/${c.body.id}`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ bookedMinor: 100000, collectedMinor: 20000, outstandingMinor: 40000, currency: 'INR' });
  expect(res.body.projects).toEqual([{ id: project.id, code: 'PRJ-0001', name: 'Website', status: 'ACTIVE', parentProjectId: null }]);
});

test.each([
  ['post', '/api/v1/clients'],
  ['patch', '/api/v1/clients/any-id'],
  ['post', '/api/v1/clients/any-id/archive'],
] as const)('CEO cannot %s %s', async (method, path) => {
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  expect((await agent[method](path).set('X-CSRF-Token', csrf).send({ name: 'X' })).status).toBe(403);
});

test('validation: blank name is rejected', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const res = await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: '   ' });
  expect(res.status).toBe(400);
  expect(res.body.error.details[0].path).toEqual(['name']);
});

test('unauthenticated list is 401', async () => {
  expect((await request(app.getHttpServer()).get('/api/v1/clients')).status).toBe(401);
});
