import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
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

const HEADER =
  'client,client_email,project,status,expected_amount,currency,won_date,closed_date,owner_email,milestone,milestone_amount,due_date,paid_amount,paid_date,invoice_id';
const CSV = [
  HEADER,
  'Acme,ap@acme.test,Website,ACTIVE,"1,00,000",,2026-01-10,,,Design,40000,2026-02-01,40000,2026-02-05,INV-1',
  'Acme,,Website,,,,,,,Build,60000,2026-05-01,25000,2026-05-03,INV-2',
  'Bluepeak,,Audit,LEAD,30000,,,,,,,,,,',
].join('\n');

test('an Admin previews then imports clients, projects, milestones and payments', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
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
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
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
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const bad = `${CSV}\nZenith,,Portal,WON,5000,,2026-03-01,,nobody@x.test,,,,,,`;
  const res = await agent.post('/api/v1/imports').set('X-CSRF-Token', csrf).send({ csv: bad });
  expect(res.status).toBe(400);
  expect(res.body.error.details.errors).toEqual([
    { line: 5, message: 'owner_email "nobody@x.test" is not an active Admin or Sales user.' },
  ]);
  expect(await prisma.project.count()).toBe(0);
  expect(await prisma.client.count()).toBe(0);
});

test('an existing client is reused, matched by name', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'ACME' }).expect(201);
  const preview = await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv: CSV });
  expect(preview.body).toMatchObject({ newClients: 1, existingClients: 1 });
  await agent.post('/api/v1/imports').set('X-CSRF-Token', csrf).send({ csv: CSV }).expect(201);
  expect(await prisma.client.count()).toBe(2);
});

test('only Admins may import', async () => {
  for (const role of ['SALES', 'CEO'] as const) {
    const { agent, csrf } = await loginAs(app, prisma, role);
    expect((await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv: CSV })).status).toBe(403);
  }
});

test('a file well over the default 100 kB body limit can be previewed', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'ADMIN');
  const rows = Array.from({ length: 2500 }, (_, i) => `Client ${i},,Project number ${i} with a longer name,LEAD,"1,00,000",,,,,,,,,,`);
  const big = [HEADER, ...rows].join('\n');
  expect(big.length).toBeGreaterThan(150_000);
  const res = await agent.post('/api/v1/imports/preview').set('X-CSRF-Token', csrf).send({ csv: big });
  expect(res.status).toBe(200);
  expect(res.body.projects).toBe(2500);
});
