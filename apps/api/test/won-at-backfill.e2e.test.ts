import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, loginAs, resetDatabase } from './harness';

// D-070: projects entered before D-069 were confirmed on the day they were entered; the migration moves that to their
// start date when the work began earlier. Its SQL is run again here on rows made to look like that.
const SQL = readFileSync(
  path.resolve(__dirname, '../../../packages/database/prisma/migrations/20261111120000_won_at_from_start_date/migration.sql'),
  'utf8',
);

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

test('confirmed dates move back to an earlier start date; nothing else changes', async () => {
  const { agent, csrf } = await loginAs(app, prisma, 'SALES');
  const make = async (name: string, status: string, startDate?: string) =>
    (
      await agent
        .post('/api/v1/projects')
        .set('X-CSRF-Token', csrf)
        .send({ name, expectedAmountMinor: 1000, status, ...(startDate ? { startDate } : {}), newClient: { name: `C ${name}` } })
    ).body.id as string;
  const early = await make('Early', 'ACTIVE', '2026-04-01');
  const later = await make('Later', 'ACTIVE', '2099-01-01');
  const none = await make('None', 'ACTIVE');
  const lead = await make('Lead', 'LEAD', '2026-04-01');
  // As they were before D-069: confirmed on the day they were entered.
  await prisma.project.updateMany({ where: { id: { in: [early, later, none] } }, data: { wonAt: new Date('2026-11-08T00:00:00Z') } });

  await prisma.$executeRawUnsafe(SQL);

  const wonAt = async (id: string) => (await prisma.project.findUniqueOrThrow({ where: { id } })).wonAt?.toISOString().slice(0, 10) ?? null;
  expect(await wonAt(early)).toBe('2026-04-01');
  expect(await wonAt(later)).toBe('2026-11-08'); // started after it was confirmed
  expect(await wonAt(none)).toBe('2026-11-08'); // no start date
  expect(await wonAt(lead)).toBeNull(); // not confirmed
});
