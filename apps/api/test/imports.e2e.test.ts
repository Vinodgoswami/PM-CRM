import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, createUser, loginAs, resetDatabase } from './harness';

let app: INestApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
});
beforeEach(async () => {
  await resetDatabase(prisma);
  // D-021: imports name each project's manager; the CEO who imports owns nothing.
  await createUser(prisma, { role: 'SALES', email: 'pm@x.test' });
});
afterAll(async () => {
  await app.close();
});

const HEADER =
  'client,client_email,project,status,expected_amount,currency,won_date,closed_date,owner_email,milestone,milestone_amount,due_date,paid_amount,paid_date,invoice_id';
const CSV = [
  HEADER,
  'Acme,ap@acme.test,Website,ACTIVE,"1,00,000",,2026-01-10,,pm@x.test,Design,40000,2026-02-01,40000,2026-02-05,INV-1',
  'Acme,,Website,,,,,,,Build,60000,2026-05-01,25000,2026-05-03,INV-2',
  'Bluepeak,,Audit,LEAD,30000,,,,pm@x.test,,,,,,',
].join('\n');

test('the CEO previews then imports clients, projects, milestones and payments (D-021)', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  const preview = await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv: CSV });
  expect(preview.status).toBe(200);
  expect(preview.body).toMatchObject({ projects: 2, newClients: 2, existingClients: 0, milestones: 2, payments: 2, errors: [] });
  expect(preview.body.sample[0]).toMatchObject({ client: 'Acme', name: 'Website', expectedAmountMinor: 10000000, paidMinor: 6500000 });
  expect(await prisma.project.count()).toBe(0);

  const run = await agent.post('/api/v1/imports').set('X-CSRF-Token', csrf).send({ csv: CSV });
  expect(run.status).toBe(201);
  expect(run.body).toEqual({ projects: 2, newClients: 2, milestones: 2, payments: 2 });
  const web = await prisma.project.findFirstOrThrow({
    where: { name: 'Website' },
    include: { milestones: { include: { payments: true } } },
  });
  expect(web).toMatchObject({ status: 'ACTIVE', expectedAmountMinor: 10000000n, code: expect.stringMatching(/^PRJ-\d{4}$/) });
  expect(web.wonAt?.toISOString().slice(0, 10)).toBe('2026-01-10');
  expect(web.milestones.map((m) => [m.number, m.title, m.payments.length])).toEqual([
    [1, 'Design', 1],
    [2, 'Build', 1],
  ]);
  expect(await prisma.auditLog.count({ where: { action: 'import.run' } })).toBe(1);
});

test('running the same file twice is refused: the projects already exist', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  await agent.post('/api/v1/imports').set('X-CSRF-Token', csrf).send({ csv: CSV }).expect(201);
  const again = await agent.post('/api/v1/imports').set('X-CSRF-Token', csrf).send({ csv: CSV });
  expect(again.status).toBe(400);
  expect(again.body.error.details.errors).toEqual([
    { line: 2, message: expect.stringMatching(/^Project "Website" already exists for Acme \(PRJ-\d{4}\)\.$/) },
    { line: 4, message: expect.stringMatching(/^Project "Audit" already exists for Bluepeak/) },
  ]);
  expect(await prisma.project.count()).toBe(2);
});

test('any error imports nothing; an unknown owner email is an error', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  const bad = `${CSV}\nZenith,,Portal,WON,5000,,2026-03-01,,nobody@x.test,,,,,,`;
  const res = await agent.post('/api/v1/imports').set('X-CSRF-Token', csrf).send({ csv: bad });
  expect(res.status).toBe(400);
  expect(res.body.error.details.errors).toEqual([{ line: 5, message: 'owner_email "nobody@x.test" is not an active Project Manager.' }]);
  expect(await prisma.project.count()).toBe(0);
  expect(await prisma.client.count()).toBe(0);
});

test('an existing client is reused, matched by name', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'ACME' }).expect(201);
  const preview = await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv: CSV });
  expect(preview.body).toMatchObject({ newClients: 1, existingClients: 1 });
  await agent.post('/api/v1/imports').set('X-CSRF-Token', csrf).send({ csv: CSV }).expect(201);
  expect(await prisma.client.count()).toBe(2);
});

test('only the CEO may import (D-021)', async () => {
  for (const role of ['SALES', 'ADMIN'] as const) {
    const { agent, csrf } = await loginAs(app, prisma, role);
    expect((await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv: CSV })).status).toBe(403);
  }
});

test('a file well over the default 100 kB body limit can be previewed', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  const rows = Array.from(
    { length: 2500 },
    (_, i) => `Client ${i},,Project number ${i} with a longer name,LEAD,"1,00,000",,,,pm@x.test,,,,,,`,
  );
  const big = [HEADER, ...rows].join('\n');
  expect(big.length).toBeGreaterThan(150_000);
  const res = await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv: big });
  expect(res.status).toBe(200);
  expect(res.body.projects).toBe(2500);
});

test('D-020 imported payments record both amounts: the fx_rate column or the day’s rate; missing rates are problems', async () => {
  await prisma.setting.upsert({ where: { id: 1 }, update: { baseCurrency: 'USD' }, create: { id: 1, baseCurrency: 'USD' } });
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  const head = `${HEADER},fx_rate`;
  const rows = [
    head,
    'Acme,,Website,ACTIVE,"1,00,000",INR,2026-01-10,,pm@x.test,Design,40000,2026-02-01,40000,2026-02-05,INV-1,0.0105',
    'Acme,,Website,,,,,,,Build,60000,2026-05-01,25000,2026-05-03,INV-2,',
  ];
  const ok = await agent
    .post('/api/v1/imports')
    .set('X-CSRF-Token', csrf)
    .send({ csv: rows.join('\n') });
  expect(ok.status).toBe(201);
  const pays = await prisma.payment.findMany({ orderBy: { paymentDate: 'asc' } });
  expect(pays.map((p) => [p.fxRate?.toString(), Number(p.baseAmountMinor), p.baseCurrency])).toEqual([
    ['0.0105', 42000, 'USD'],
    ['0.012', 30000, 'USD'],
  ]);
  expect((await prisma.project.findFirstOrThrow()).fxRate?.toString()).toBe('0.012');

  const eur = [head, 'Initech,,Audit,WON,1000,EUR,2026-01-10,,pm@x.test,M,1000,2026-02-01,500,2026-02-05,,'].join('\n');
  const preview = await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv: eur });
  expect(preview.body.errors).toEqual([
    { line: 2, message: 'No exchange rate for EUR → USD on 2026-02-05. Add it in the fx_rate column.' },
  ]);
});

test('every imported project names its project manager', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'CEO');
  const csv = [HEADER, 'Zenith,,Portal,LEAD,5000,,,,,,,,,,'].join('\n');
  const res = await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv });
  expect(res.body.errors).toEqual([{ line: 2, message: 'owner_email is required: give the project manager who owns this project.' }]);
});
