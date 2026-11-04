import { type INestApplication } from '@nestjs/common';
import { verifyPassword } from '@salescrm/auth';
import { type PrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createFirstAdmin } from '../scripts/create-admin';
import { createTestApp, createUser, resetDatabase } from './harness';

// Production has no demo seed: the very first Admin is created once with this script.
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

test('creates the first Admin with a hashed password', async () => {
  const admin = await createFirstAdmin(prisma, { email: ' Owner@Example.com ', name: 'Owner', password: 'a-long-enough-password' });
  const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  expect(row).toMatchObject({ email: 'owner@example.com', name: 'Owner', role: 'ADMIN', active: true });
  expect(row.passwordHash).not.toContain('a-long-enough-password');
  expect(await verifyPassword(row.passwordHash!, 'a-long-enough-password')).toBe(true);
});

test('refuses when an Admin already exists, or the details are not valid', async () => {
  await expect(createFirstAdmin(prisma, { email: 'a@x.test', name: 'A', password: 'short' })).rejects.toThrow(/10 characters/);
  await expect(createFirstAdmin(prisma, { email: 'not-an-email', name: 'A', password: 'a-long-enough-password' })).rejects.toThrow(
    /valid email/,
  );
  await createUser(prisma, { role: 'ADMIN' });
  await expect(createFirstAdmin(prisma, { email: 'b@x.test', name: 'B', password: 'a-long-enough-password' })).rejects.toThrow(
    /already has an Admin/,
  );
});
