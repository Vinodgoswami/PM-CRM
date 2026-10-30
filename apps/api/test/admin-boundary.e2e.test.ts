import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, createUser, loginAs, resetDatabase } from './harness';

// D-021: the Admin manages accounts and sees counts only; the CEO and project managers own the business data.
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

async function someWork() {
  const pm = await createUser(prisma, { role: 'SALES' });
  const ceo = await loginAs(app, prisma, 'CEO');
  const p = await ceo.agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', ceo.csrf)
    .send({
      name: 'Secret project',
      expectedAmountMinor: 100000,
      status: 'WON',
      ownerId: pm.id,
      newClient: { name: 'Secret client' },
      milestones: [{ title: 'All', amountMinor: 100000, dueDate: '2026-10-01' }],
    })
    .expect(201);
  const pay = await ceo.agent
    .post(`/api/v1/milestones/${p.body.milestones[0].id}/payments`)
    .set('X-CSRF-Token', ceo.csrf)
    .set('Idempotency-Key', `adm-${Date.now()}`)
    .send({ paymentDate: '2026-10-05', amountMinor: 40000 })
    .expect(201);
  return { ceo, project: p.body, payment: pay.body };
}

test('the Admin cannot read or write client, project or payment records, or import', async () => {
  const { project } = await someWork();
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  for (const path of ['/projects', `/projects/${project.id}`, '/clients', '/invoices', '/payments', '/exports/csv/billing']) {
    expect([path, (await agent.get(`/api/v1${path}`)).status]).toEqual([path, 403]);
  }
  expect(
    (
      await agent
        .post('/api/v1/projects')
        .set('X-CSRF-Token', csrf)
        .send({ name: 'X', expectedAmountMinor: 1, newClient: { name: 'Y' } })
    ).status,
  ).toBe(403);
  expect(
    (await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv: 'client,project,expected_amount' })).status,
  ).toBe(403);
});

test('the Admin overview has counts only: no names, no amounts', async () => {
  await someWork();
  const { agent } = await loginAs(app, prisma, 'ADMIN');
  const res = await agent.get('/api/v1/admin/overview');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    users: { total: 3, active: 3, admins: 1, ceos: 1, projectManagers: 1 },
    clients: 1,
    projects: 1,
    payments: 1,
    documents: 0,
  });
  expect(JSON.stringify(res.body)).not.toMatch(/Secret|100000|40000/);
  const ceo = await loginAs(app, prisma, 'CEO');
  expect((await ceo.agent.get('/api/v1/admin/overview')).status).toBe(403);
});

test('the Admin may rename the company; currency, financial year and time zone are the CEO’s', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  const name = await admin.agent.patch('/api/v1/settings').set('X-CSRF-Token', admin.csrf).send({ companyName: 'ChicMic Studios' });
  expect(name.status).toBe(200);
  expect((await admin.agent.patch('/api/v1/settings').set('X-CSRF-Token', admin.csrf).send({ baseCurrency: 'USD' })).status).toBe(403);
  const ceo = await loginAs(app, prisma, 'CEO');
  const currency = await ceo.agent.patch('/api/v1/settings').set('X-CSRF-Token', ceo.csrf).send({ baseCurrency: 'USD', fyStartMonth: 1 });
  expect(currency.status).toBe(200);
  expect(currency.body).toMatchObject({ companyName: 'ChicMic Studios', baseCurrency: 'USD', fyStartMonth: 1 });
});

test('the Admin’s audit log has account events only; the CEO sees everything', async () => {
  await someWork();
  const admin = await loginAs(app, prisma, 'ADMIN');
  await admin.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', admin.csrf)
    .send({ email: 'n@x.test', name: 'N', role: 'SALES' })
    .expect(201);
  const forAdmin = (await admin.agent.get('/api/v1/audit')).body.items as { action: string }[];
  expect(forAdmin.map((e) => e.action)).toContain('user.invite');
  expect(forAdmin.some((e) => /^(project|client|payment)\./.test(e.action))).toBe(false);
  const ceo = await loginAs(app, prisma, 'CEO');
  const forCeo = (await ceo.agent.get('/api/v1/audit?pageSize=100')).body.items as { action: string }[];
  expect(forCeo.map((e) => e.action)).toEqual(expect.arrayContaining(['project.create', 'payment.create', 'user.invite']));
});

test('the CEO reverses a wrong payment', async () => {
  const { ceo, payment } = await someWork();
  const rev = await ceo.agent.post(`/api/v1/payments/${payment.id}/reverse`).set('X-CSRF-Token', ceo.csrf).send({ reason: 'Wrong amount' });
  expect(rev.status).toBe(201);
});

test('D-022 the Admin’s dashboard has the business figures, with every client and project name left out', async () => {
  await someWork();
  const { agent } = await loginAs(app, prisma, 'ADMIN');
  const d = (await agent.get('/api/v1/dashboard?period=TWO_FY')).body;
  expect(d.anonymous).toBe(true);
  expect(d.kpis).toMatchObject({ bookedMinor: 100000, collectedMinor: 40000, wonCount: 1 });
  expect(d.monthly).toHaveLength(12);
  expect(d.team).toHaveLength(1); // per project manager: the Admin manages these people
  expect(d.upcomingSummary.reduce((s: number, g: { count: number }) => s + g.count, 0)).toBe(1);
  for (const list of ['upcoming', 'overdue', 'recentPayments', 'topClients', 'clientRevenue', 'upcomingBookings'])
    expect([list, d[list]]).toEqual([list, []]);
  expect(JSON.stringify(d)).not.toMatch(/Secret/);

  const ceo = await loginAs(app, prisma, 'CEO');
  const full = (await ceo.agent.get('/api/v1/dashboard?period=TWO_FY')).body;
  expect(full.anonymous).toBe(false);
  expect(JSON.stringify(full)).toMatch(/Secret client/);
});
