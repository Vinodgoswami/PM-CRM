import { afterEach, expect, test, vi } from 'vitest';
import { BrevoMailer, mailerFor } from '../src/modules/mail/mailer';

// D-032: Render's free plan blocks SMTP ports, so mail can go to Brevo over HTTPS instead.
const mail = { to: 'ceo@x.test', subject: 'Invite', text: 'Hello', html: '<p>Hello</p>' };
afterEach(() => vi.unstubAllGlobals());

test('sends the email to the Brevo API with the key and the named sender', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"messageId":"m1"}', { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  const mailer = mailerFor({ transport: 'brevo', from: 'PM CRM <crm@chicmic.test>', brevo: { apiKey: 'test-key' } });
  expect(mailer).toBeInstanceOf(BrevoMailer);
  expect(mailer.delivers).toBe(true);
  await mailer.send(mail);
  const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
  expect(url).toBe('https://api.brevo.com/v3/smtp/email');
  expect((init.headers as Record<string, string>)['api-key']).toBe('test-key');
  expect(JSON.parse(init.body as string)).toEqual({
    sender: { name: 'PM CRM', email: 'crm@chicmic.test' },
    to: [{ email: 'ceo@x.test' }],
    subject: 'Invite',
    htmlContent: '<p>Hello</p>',
    textContent: 'Hello',
  });
});

test('a bare sender address works, and a refusal is reported with Brevo’s reason but never the key', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"unauthorized","message":"Key not found"}', { status: 401 })));
  const mailer = new BrevoMailer({ transport: 'brevo', from: 'crm@chicmic.test', brevo: { apiKey: 'secret-key-123' } });
  const error = await mailer.send(mail).then(
    () => null,
    (e: Error) => e,
  );
  expect(error?.message).toBe('Brevo refused the email (401): Key not found');
  expect(error?.message).not.toContain('secret-key-123');
});
