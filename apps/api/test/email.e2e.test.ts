import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { type LogMailer, MAILER } from '../src/modules/mail/mailer';
import { createTestApp, createUser, loginAs, resetDatabase } from './harness';

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
  outbox.delivers = true; // stands in for a real SMTP server in these tests
  await prisma.setting.upsert({
    where: { id: 1 },
    update: { companyName: 'ChicMic Studios' },
    create: { id: 1, companyName: 'ChicMic Studios' },
  });
});
afterAll(async () => {
  await app.close();
});

test('an invite is emailed to the invitee with the link; the link is still returned to share by hand', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  const res = await admin.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', admin.csrf)
    .send({ email: 'vikram@x.test', name: 'Vikram Shah', role: 'CEO' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ emailed: true, url: expect.stringMatching(/\/invite\//) });
  expect(outbox.sent).toHaveLength(1);
  const mail = outbox.sent[0]!;
  expect(mail.to).toBe('vikram@x.test');
  expect(mail.subject).toBe('You’re invited to ChicMic Studios as CEO');
  expect(mail.text).toContain(res.body.url);
  expect(mail.text).toContain('Vikram Shah');
  expect(mail.html).toContain(`href="${res.body.url}"`);
});

test('resending an invite emails the new link', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  await admin.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', admin.csrf)
    .send({ email: 'pm@x.test', name: 'PM', role: 'SALES' })
    .expect(201);
  const [invite] = (await admin.agent.get('/api/v1/users/invites')).body.items;
  const resent = await admin.agent.post(`/api/v1/users/invites/${invite.id}/resend`).set('X-CSRF-Token', admin.csrf);
  expect(resent.body.emailed).toBe(true);
  expect(outbox.sent.at(-1)!.text).toContain(resent.body.url);
});

test('a password reset link is emailed to the user', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  const pm = await createUser(prisma, { role: 'SALES', email: 'rohan@x.test', name: 'Rohan Mehta' });
  const res = await admin.agent.post(`/api/v1/users/${pm.id}/reset-link`).set('X-CSRF-Token', admin.csrf);
  expect(res.body.emailed).toBe(true);
  const mail = outbox.sent.at(-1)!;
  expect(mail.to).toBe('rohan@x.test');
  expect(mail.subject).toBe('Reset your Project Management CRM password');
  expect(mail.text).toContain(res.body.url);
});

test('if sending fails, the invite still exists and the link is returned to share by hand', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  const original = outbox.send.bind(outbox);
  outbox.send = async () => {
    throw new Error('SMTP down');
  };
  try {
    const res = await admin.agent
      .post('/api/v1/users/invite')
      .set('X-CSRF-Token', admin.csrf)
      .send({ email: 'x@x.test', name: 'X', role: 'SALES' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ emailed: false, url: expect.any(String) });
    expect((await admin.agent.get('/api/v1/users/invites')).body.items).toHaveLength(1);
  } finally {
    outbox.send = original;
  }
});

test('names in the email cannot inject HTML', async () => {
  const admin = await loginAs(app, prisma, 'ADMIN');
  await admin.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', admin.csrf)
    .send({ email: 'y@x.test', name: '<img src=x onerror=alert(1)>', role: 'SALES' })
    .expect(201);
  expect(outbox.sent.at(-1)!.html).not.toContain('<img src=x');
  expect(outbox.sent.at(-1)!.html).toContain('&lt;img src=x');
});

test('in log mode (no SMTP set up) nothing is delivered, so the screen must not say it was emailed', async () => {
  outbox.delivers = false;
  const admin = await loginAs(app, prisma, 'ADMIN');
  const res = await admin.agent
    .post('/api/v1/users/invite')
    .set('X-CSRF-Token', admin.csrf)
    .send({ email: 'z@x.test', name: 'Z', role: 'SALES' });
  expect(res.body.emailed).toBe(false);
  expect(outbox.sent.at(-1)!.to).toBe('z@x.test'); // still written to the log for development
});
