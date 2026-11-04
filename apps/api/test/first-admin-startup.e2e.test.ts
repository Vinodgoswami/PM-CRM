import { verifyPassword } from '@salescrm/auth';
import { type PrismaClient } from '@salescrm/database';
import { afterEach, beforeAll, expect, test } from 'vitest';
import { createTestApp, resetDatabase } from './harness';
import { type INestApplication } from '@nestjs/common';

// D-033: on hosts without a shell (Render free), the first Admin is created at startup from three settings.
const firstAdmin = { email: 'owner@x.test', name: 'Owner', password: 'a-long-enough-password' };
let apps: INestApplication[] = [];
let prisma: PrismaClient;
beforeAll(async () => {
  const { app, prisma: p } = await createTestApp();
  prisma = p;
  await resetDatabase(prisma);
  await app.close();
});
afterEach(async () => {
  for (const a of apps) await a.close();
  apps = [];
});
const start = async () => {
  const { app } = await createTestApp({ firstAdmin });
  apps.push(app);
};

test('creates the Admin once at startup, and never changes it on later starts', async () => {
  await start();
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@x.test' } });
  expect(admin).toMatchObject({ role: 'ADMIN', name: 'Owner', active: true });
  expect(await verifyPassword(admin.passwordHash!, firstAdmin.password)).toBe(true);

  await prisma.user.update({ where: { id: admin.id }, data: { name: 'Renamed' } });
  await start(); // a later restart with the same settings: an Admin exists, so nothing happens
  expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).name).toBe('Renamed');
});
