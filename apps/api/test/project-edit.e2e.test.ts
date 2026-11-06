import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, loginAs, resetDatabase } from './harness';

// D-027: the whole project is editable; a paid milestone is reset (its payments reversed) before its amount changes.
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

async function paidProject(agent: Agent, csrf: string) {
  const p = await agent
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
  const milestoneId = p.body.milestones[0].id as string;
  await agent
    .post(`/api/v1/milestones/${milestoneId}/payments`)
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', `k-${Math.random()}`)
    .send({ paymentDate: '2026-10-05', amountMinor: 600 })
    .expect(201);
  return { project: p.body as { id: string; updatedAt: string; client: { id: string } }, milestoneId };
}

test('D-027 the project manager resets a paid milestone, then can lower its amount', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { project, milestoneId } = await paidProject(agent, csrf);
  const lower = () => agent.patch(`/api/v1/milestones/${milestoneId}`).set('X-CSRF-Token', csrf).send({ amountMinor: 500 });
  expect((await lower()).status).toBe(400); // MS-2: below what is paid

  const reset = await agent
    .post(`/api/v1/milestones/${milestoneId}/reset-payments`)
    .set('X-CSRF-Token', csrf)
    .send({ reason: 'Scope changed' });
  expect(reset.status).toBe(200);
  expect(reset.body).toEqual({ reversed: 1 });
  expect((await lower()).status).toBe(200);

  const items = (await agent.get(`/api/v1/payments?projectId=${project.id}`)).body.items as { amountMinor: number; note: string | null }[];
  expect(items.map((p) => p.amountMinor).sort((a, b) => a - b)).toEqual([-600, 600]);
  expect(items.find((p) => p.amountMinor < 0)!.note).toBe('Reset: Scope changed');
  expect(await prisma.auditLog.count({ where: { action: 'milestone.reset' } })).toBe(1);

  // Nothing left to reverse: a second reset is a no-op.
  const again = await agent.post(`/api/v1/milestones/${milestoneId}/reset-payments`).set('X-CSRF-Token', csrf).send({ reason: 'x' });
  expect(again.body).toEqual({ reversed: 0 });
});

test('D-027 a reset needs a reason, and another project manager cannot reset', async () => {
  const owner = await loginAs(app, prisma, 'SALES');
  const { milestoneId } = await paidProject(owner.agent, owner.csrf);
  expect(
    (await owner.agent.post(`/api/v1/milestones/${milestoneId}/reset-payments`).set('X-CSRF-Token', owner.csrf).send({ reason: ' ' }))
      .status,
  ).toBe(400);
  const other = await loginAs(app, prisma, 'SALES');
  expect(
    (await other.agent.post(`/api/v1/milestones/${milestoneId}/reset-payments`).set('X-CSRF-Token', other.csrf).send({ reason: 'x' }))
      .status,
  ).toBe(403);
});

test('D-027 a project moves to another client billed in the same currency', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { project } = await paidProject(agent, csrf);
  const same = await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Same Co' }).expect(201);
  const euro = await agent.post('/api/v1/clients').set('X-CSRF-Token', csrf).send({ name: 'Euro Co', currency: 'EUR' }).expect(201);
  const current = (await agent.get(`/api/v1/projects/${project.id}`)).body as { updatedAt: string; currency: string };

  const refused = await agent
    .patch(`/api/v1/projects/${project.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ clientId: euro.body.id, updatedAt: current.updatedAt });
  expect(refused.status).toBe(400);
  expect(refused.body.error.message).toMatch(/billed in/);

  const moved = await agent
    .patch(`/api/v1/projects/${project.id}`)
    .set('X-CSRF-Token', csrf)
    .send({ clientId: same.body.id, updatedAt: current.updatedAt });
  expect(moved.status).toBe(200);
  expect(moved.body.client).toMatchObject({ id: same.body.id, name: 'Same Co' });
});

test('the project list gives milestone progress and the initial booking for the client accordion', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const { project } = await paidProject(agent, csrf);
  // MS-5: an upsell makes room for a second milestone beyond the 1,000 booking.
  await agent
    .post(`/api/v1/projects/${project.id}/upsells`)
    .set('X-CSRF-Token', csrf)
    .send({ amountMinor: 400, date: '2026-10-01' })
    .expect(201);
  await agent
    .post(`/api/v1/projects/${project.id}/milestones`)
    .set('X-CSRF-Token', csrf)
    .send({ title: 'Second', amountMinor: 400, dueDate: '2026-12-01' })
    .expect(201);
  const list = await agent.get(`/api/v1/projects?clientId=${project.client.id}`);
  expect(list.body.items).toMatchObject([{ id: project.id, expectedAmountMinor: 1000, milestoneCount: 2, paidMilestoneCount: 0 }]);
});
