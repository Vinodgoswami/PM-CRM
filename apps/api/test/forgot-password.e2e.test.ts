import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { type LogMailer, MAILER } from '../src/modules/mail/mailer';
import { createTestApp, createUser, resetDatabase, TEST_PASSWORD } from './harness';

// D-034: anyone who forgot their password asks for a reset link by email; the answer never says whether the
// address has an account, and repeated requests are capped.
let app: INestApplication;
let prisma: PrismaClient;
let outbox: LogMailer;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  outbox = app.get(MAILER);
});
beforeEach(async () => {
  await resetDatabase(prisma);
  outbox.sent.length = 0;
});
afterAll(async () => {
  await app.close();
});
const http = () => request(app.getHttpServer());
const forgot = (email: string) => http().post('/api/v1/auth/password/forgot').send({ email });
const tokenFrom = (text: string) => /\/reset\/([A-Za-z0-9_-]{43})/.exec(text)![1]!;
const NEW_PASSWORD = 'a-brand-new-password';
const GENERIC = 'If that email has an account, a reset link is on its way. It works once and expires in 24 hours.';

test.each(['SALES', 'CEO', 'ADMIN'] as const)('a %s who forgot their password resets it from the emailed link', async (role) => {
  const user = await createUser(prisma, { role });
  const res = await forgot(user.email.toUpperCase());
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: GENERIC });
  expect(outbox.sent).toHaveLength(1);
  expect(outbox.sent[0]).toMatchObject({ to: user.email, subject: 'Reset your Project Management CRM password' });
  expect(outbox.sent[0]!.text).toContain('You asked to reset your password');

  const reset = await http()
    .post('/api/v1/auth/password/reset')
    .send({ token: tokenFrom(outbox.sent[0]!.text), password: NEW_PASSWORD });
  expect(reset.status).toBe(204);
  expect((await http().post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(401);
  expect((await http().post('/api/v1/auth/login').send({ email: user.email, password: NEW_PASSWORD })).status).toBe(200);
});

test('unknown or deactivated addresses get the same answer and no email', async () => {
  const gone = await createUser(prisma, { role: 'SALES' });
  await prisma.user.update({ where: { id: gone.id }, data: { active: false } });
  for (const email of ['nobody@x.test', gone.email]) {
    const res = await forgot(email);
    expect([email, res.status, res.body]).toEqual([email, 200, { message: GENERIC }]);
  }
  expect(outbox.sent).toHaveLength(0);
  expect((await forgot('not-an-email')).status).toBe(400);
});

test('at most three links per account in 15 minutes; asking again replaces nothing', async () => {
  const user = await createUser(prisma, { role: 'SALES' });
  for (let i = 0; i < 4; i++) expect((await forgot(user.email)).body).toEqual({ message: GENERIC });
  expect(outbox.sent).toHaveLength(3);
});
