import { type PrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { clearWorkData } from '../scripts/clear-work-data';
import { runSeed } from '../scripts/seed';
import { createTestApp } from './harness';
import { type INestApplication } from '@nestjs/common';

let app: INestApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
});
beforeEach(async () => {
  await runSeed(prisma, { today: '2026-10-30', password: 'seed-test-password' });
});
afterAll(async () => {
  await app.close();
});

test('start fresh: work data and audit history go; users, sessions and company settings stay', async () => {
  const usersBefore = await prisma.user.count();
  await prisma.setting.upsert({
    where: { id: 1 },
    update: { companyName: 'ChicMic Studios', baseCurrency: 'USD' },
    create: { id: 1, companyName: 'ChicMic Studios', baseCurrency: 'USD' },
  });
  expect(await prisma.payment.count()).toBeGreaterThan(0);

  const removed = await clearWorkData(prisma);

  expect(removed.projects).toBeGreaterThan(0);
  for (const count of [
    prisma.client.count(),
    prisma.clientContact.count(),
    prisma.project.count(),
    prisma.upsellEntry.count(),
    prisma.milestone.count(),
    prisma.payment.count(),
    prisma.document.count(),
    prisma.auditLog.count(),
  ]) {
    expect(await count).toBe(0);
  }
  expect(await prisma.user.count()).toBe(usersBefore);
  expect(await prisma.setting.findUnique({ where: { id: 1 } })).toMatchObject({ companyName: 'ChicMic Studios', baseCurrency: 'USD' });
  const [seq] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('project_code_seq')`;
  expect(Number(seq!.nextval)).toBe(1);
});
