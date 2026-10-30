import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { DocumentsService } from '../src/modules/documents/documents.service';
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

type Agent = ReturnType<typeof request.agent>;
const PDF = Buffer.from('%PDF-1.7\nhello proposal\n%%EOF');
const http = () => request(app.getHttpServer());

async function newProject(agent: Agent, csrf: string) {
  const res = await agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', csrf)
    .send({ name: 'P', expectedAmountMinor: 1000, newClient: { name: `C ${Math.random()}` } });
  return res.body.id as string;
}

async function requestUpload(agent: Agent, csrf: string, projectId: string, overrides: object = {}) {
  return agent
    .post(`/api/v1/projects/${projectId}/documents/upload-url`)
    .set('X-CSRF-Token', csrf)
    .send({ name: 'Proposal.pdf', type: 'PROPOSAL', mimeType: 'application/pdf', sizeBytes: PDF.length, ...overrides });
}

const pathOf = (url: string) => (url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url);

test('full round trip: request → upload → confirm → list → download', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'SALES');
  const projectId = await newProject(agent, csrf);
  const slot = await requestUpload(agent, csrf, projectId);
  expect(slot.status).toBe(201);
  expect(slot.body.headers).toEqual({ 'Content-Type': 'application/pdf' });

  const put = await http().put(pathOf(slot.body.url)).set('Content-Type', 'application/pdf').send(PDF);
  expect(put.status).toBe(200);
  expect((await agent.post(`/api/v1/documents/${slot.body.documentId}/confirm`).set('X-CSRF-Token', csrf)).status).toBe(200);

  const list = await agent.get(`/api/v1/projects/${projectId}/documents`);
  expect(list.body.items).toMatchObject([
    { id: slot.body.documentId, name: 'Proposal.pdf', type: 'PROPOSAL', sizeBytes: PDF.length, uploadedBy: { id: user.id } },
  ]);

  const link = await agent.get(`/api/v1/documents/${slot.body.documentId}/download`);
  expect(link.status).toBe(200);
  const file = await http()
    .get(pathOf(link.body.url))
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  expect(file.status).toBe(200);
  expect(file.headers['content-disposition']).toBe(`attachment; filename="Proposal.pdf"; filename*=UTF-8''Proposal.pdf`);
  expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
  expect(await prisma.auditLog.count({ where: { action: 'document.upload' } })).toBe(1);
});

test('files over 25 MB and disallowed types are refused up front', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const projectId = await newProject(agent, csrf);
  expect((await requestUpload(agent, csrf, projectId, { sizeBytes: 30 * 1024 * 1024 })).status).toBe(400);
  expect((await requestUpload(agent, csrf, projectId, { mimeType: 'application/x-msdownload', name: 'run.exe' })).status).toBe(400);
});

test('confirming an upload that never happened leaves no document', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const projectId = await newProject(agent, csrf);
  const slot = await requestUpload(agent, csrf, projectId);
  const res = await agent.post(`/api/v1/documents/${slot.body.documentId}/confirm`).set('X-CSRF-Token', csrf);
  expect(res.status).toBe(400);
  expect(await prisma.document.count()).toBe(0);
});

test('an upload with a different type than declared fails confirmation', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const projectId = await newProject(agent, csrf);
  const slot = await requestUpload(agent, csrf, projectId);
  const put = await http().put(pathOf(slot.body.url)).set('Content-Type', 'application/zip').send(PDF);
  expect(put.status).toBe(400);
});

test('a body larger than declared is rejected', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const projectId = await newProject(agent, csrf);
  const slot = await requestUpload(agent, csrf, projectId, { sizeBytes: 5 });
  const put = await http().put(pathOf(slot.body.url)).set('Content-Type', 'application/pdf').send(PDF);
  expect(put.status).toBe(413);
});

test('tampered and expired storage tokens are refused', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const projectId = await newProject(agent, csrf);
  const slot = await requestUpload(agent, csrf, projectId);
  const path = pathOf(slot.body.url);
  const tampered = path.slice(0, -2) + (path.endsWith('aa') ? 'bb' : 'aa');
  expect((await http().put(tampered).set('Content-Type', 'application/pdf').send(PDF)).status).toBe(403);

  const [prefix, token] = [path.slice(0, path.lastIndexOf('/') + 1), path.slice(path.lastIndexOf('/') + 1)];
  const [body, sig] = token.split('.');
  const payload = JSON.parse(Buffer.from(body!, 'base64url').toString());
  const expired = Buffer.from(JSON.stringify({ ...payload, e: Date.now() - 1000 })).toString('base64url');
  expect((await http().put(`${prefix}${expired}.${sig}`).set('Content-Type', 'application/pdf').send(PDF)).status).toBe(403);
});

test('roles: another rep cannot upload or delete; the CEO can download and upload (D-018)', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  const projectId = await newProject(owner.agent, owner.csrf);
  const slot = await requestUpload(owner.agent, owner.csrf, projectId);
  await http().put(pathOf(slot.body.url)).set('Content-Type', 'application/pdf').send(PDF);
  await owner.agent.post(`/api/v1/documents/${slot.body.documentId}/confirm`).set('X-CSRF-Token', owner.csrf).expect(200);

  const other = await loginAs(app, prisma, 'SALES');
  expect((await requestUpload(other.agent, other.csrf, projectId)).status).toBe(403);
  expect((await other.agent.delete(`/api/v1/documents/${slot.body.documentId}`).set('X-CSRF-Token', other.csrf)).status).toBe(403);

  const ceo = await loginAs(app, prisma, 'CEO');
  expect((await ceo.agent.get(`/api/v1/documents/${slot.body.documentId}/download`)).status).toBe(200);
  expect((await requestUpload(ceo.agent, ceo.csrf, projectId)).status).toBe(201);

  expect((await owner.agent.delete(`/api/v1/documents/${slot.body.documentId}`).set('X-CSRF-Token', owner.csrf)).status).toBe(204);
  expect(await prisma.document.count({ where: { status: 'READY' } })).toBe(0);
});

test('download names with non-ASCII characters work', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const projectId = await newProject(agent, csrf);
  const slot = await requestUpload(agent, csrf, projectId, { name: 'Proposal – Acme.pdf' });
  await http().put(pathOf(slot.body.url)).set('Content-Type', 'application/pdf').send(PDF);
  await agent.post(`/api/v1/documents/${slot.body.documentId}/confirm`).set('X-CSRF-Token', csrf).expect(200);
  const link = await agent.get(`/api/v1/documents/${slot.body.documentId}/download`);
  const file = await http().get(pathOf(link.body.url));
  expect(file.status).toBe(200);
  expect(file.headers['content-disposition']).toBe(
    `attachment; filename="Proposal _ Acme.pdf"; filename*=UTF-8''Proposal%20%E2%80%93%20Acme.pdf`,
  );
});

test('the raw upload body parser is only mounted for local storage', async () => {
  // With S3 nothing may buffer up-to-26 MB anonymous bodies on this route (review finding).
  const hasRawParser = (a: INestApplication) =>
    (a.getHttpAdapter().getInstance() as { router: { stack: { name: string }[] } }).router.stack.some((l) => l.name === 'rawParser');
  expect(hasRawParser(app)).toBe(true);
  const { app: s3App } = await createTestApp({
    storage: {
      driver: 's3',
      bucket: 'b',
      region: 'auto',
      accessKeyId: 'k',
      secretAccessKey: 's',
      endpoint: 'https://acc.r2.cloudflarestorage.com',
    },
  });
  try {
    expect(hasRawParser(s3App)).toBe(false);
  } finally {
    await s3App.close();
  }
});

test('abandoned uploads are swept after an hour; fresh and confirmed ones stay', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const projectId = await newProject(agent, csrf);
  const old = await requestUpload(agent, csrf, projectId, { name: 'Old.pdf' });
  const fresh = await requestUpload(agent, csrf, projectId, { name: 'Fresh.pdf' });
  const done = await requestUpload(agent, csrf, projectId, { name: 'Done.pdf' });
  await http().put(pathOf(done.body.url)).set('Content-Type', 'application/pdf').send(PDF).expect(200);
  await agent.post(`/api/v1/documents/${done.body.documentId}/confirm`).set('X-CSRF-Token', csrf).expect(200);
  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
  await prisma.document.updateMany({
    where: { id: { in: [old.body.documentId, done.body.documentId] } },
    data: { createdAt: twoHoursAgo },
  });

  const swept = await app.get(DocumentsService).sweepAbandoned();
  expect(swept).toBe(1);
  const left = await prisma.document.findMany({ select: { id: true } });
  expect(left.map((d) => d.id).sort()).toEqual([fresh.body.documentId, done.body.documentId].sort());
});

test('D-026 an invoice or payment slip is stored against its payment and listed with it', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const project = await agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', csrf)
    .send({
      name: 'Paid',
      expectedAmountMinor: 1000,
      status: 'ACTIVE',
      newClient: { name: `C ${Math.random()}` },
      milestones: [{ title: 'All', amountMinor: 1000, dueDate: '2026-10-01' }],
    })
    .expect(201);
  const other = await newProject(agent, csrf);
  const payment = await agent
    .post(`/api/v1/milestones/${project.body.milestones[0].id}/payments`)
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', `slip-${Date.now()}`)
    .send({ paymentDate: '2026-10-05', amountMinor: 1000 })
    .expect(201);

  // A payment belongs to one project: it cannot be linked from another.
  expect((await requestUpload(agent, csrf, other, { type: 'INVOICE', paymentId: payment.body.id })).status).toBe(404);

  const slot = await requestUpload(agent, csrf, project.body.id, { name: 'INV-7.pdf', type: 'INVOICE', paymentId: payment.body.id });
  expect(slot.status).toBe(201);
  await http().put(pathOf(slot.body.url)).set('Content-Type', 'application/pdf').send(PDF).expect(200);
  const doc = await agent.post(`/api/v1/documents/${slot.body.documentId}/confirm`).set('X-CSRF-Token', csrf).expect(200);
  expect(doc.body).toMatchObject({ name: 'INV-7.pdf', type: 'INVOICE', paymentId: payment.body.id });

  const billing = await agent.get(`/api/v1/payments?projectId=${project.body.id}`);
  expect(billing.body.items[0].documents).toEqual([{ id: slot.body.documentId, name: 'INV-7.pdf' }]);
});
