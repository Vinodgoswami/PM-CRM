import { expect, test } from 'vitest';
import { ConfigError, loadConfig } from '../src/index';

const SECRET = 'x'.repeat(48);
const valid = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@localhost:5432/db', SESSION_SECRET: SECRET };

test('valid env produces typed config with defaults', () => {
  expect(loadConfig(valid)).toEqual({
    nodeEnv: 'development',
    port: 4000,
    databaseUrl: 'postgresql://u:p@localhost:5432/db',
    sessionSecret: SECRET,
    webOrigin: 'http://localhost:5173',
    cookieSecure: false,
    logLevel: 'info',
    storage: { driver: 'local', localDir: './uploads' },
    fx: { provider: 'frankfurter' },
    email: { transport: 'log', from: 'Project Management CRM <no-reply@localhost>' },
  });
});

test('s3 storage needs bucket and credentials', () => {
  expect(() => loadConfig({ ...valid, STORAGE_DRIVER: 's3', S3_BUCKET: 'docs' })).toThrow(/S3_ACCESS_KEY_ID/);
  const config = loadConfig({
    ...valid,
    STORAGE_DRIVER: 's3',
    S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    S3_BUCKET: 'docs',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
  });
  expect(config.storage).toEqual({
    driver: 's3',
    endpoint: 'https://acc.r2.cloudflarestorage.com',
    bucket: 'docs',
    region: 'auto',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  });
});

test('production refuses local disk storage', () => {
  expect(() => loadConfig({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'true' })).toThrow(/STORAGE_DRIVER/);
});

test('every bad key is reported in one error', () => {
  const error = (() => {
    try {
      loadConfig({ NODE_ENV: 'development', SESSION_SECRET: 'short-one!' });
    } catch (e) {
      return e;
    }
  })();
  expect(error).toBeInstanceOf(ConfigError);
  expect((error as Error).message).toContain('DATABASE_URL');
  expect((error as Error).message).toContain('SESSION_SECRET');
});

test('production requires secure cookies', () => {
  expect(() => loadConfig({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(ConfigError);
});

test.each(['ci-only-session-secret-000000000000000000000', 'change-me-change-me-change-me-change-me'])(
  'production refuses placeholder secret %s',
  (secret) => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'true', SESSION_SECRET: secret })).toThrow(ConfigError);
  },
);

test('production with real values passes', () => {
  const config = loadConfig({
    ...valid,
    NODE_ENV: 'production',
    COOKIE_SECURE: 'true',
    WEB_ORIGIN: 'https://crm.example.com',
    STORAGE_DRIVER: 's3',
    S3_BUCKET: 'docs',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
  });
  expect(config.cookieSecure).toBe(true);
});

test('FX_PROVIDER picks where exchange rates come from (D-020)', () => {
  expect(loadConfig({ ...valid, FX_PROVIDER: 'fixed' }).fx).toEqual({ provider: 'fixed' });
  expect(loadConfig({ ...valid, FX_PROVIDER: 'off' }).fx).toEqual({ provider: 'off' });
  expect(() => loadConfig({ ...valid, FX_PROVIDER: 'random' })).toThrow(/FX_PROVIDER/);
});

test('email goes through SMTP when configured; log by default; SMTP needs a host and a from address', () => {
  const smtp = loadConfig({
    ...valid,
    EMAIL_TRANSPORT: 'smtp',
    EMAIL_FROM: 'ChicMic CRM <crm@chicmic.test>',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'crm@chicmic.test',
    SMTP_PASS: 'app-password',
  });
  expect(smtp.email).toEqual({
    transport: 'smtp',
    from: 'ChicMic CRM <crm@chicmic.test>',
    smtp: { host: 'smtp.example.com', port: 465, secure: true, user: 'crm@chicmic.test', pass: 'app-password' },
  });
  expect(() => loadConfig({ ...valid, EMAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST/);
  expect(loadConfig({ ...valid, EMAIL_TRANSPORT: 'off' }).email.transport).toBe('off');
});

test('D-032 email can go through the Brevo web API (no SMTP ports), which needs an API key and a sender', () => {
  const brevo = loadConfig({ ...valid, EMAIL_TRANSPORT: 'brevo', BREVO_API_KEY: 'test-key', EMAIL_FROM: 'PM CRM <crm@chicmic.test>' });
  expect(brevo.email).toEqual({ transport: 'brevo', from: 'PM CRM <crm@chicmic.test>', brevo: { apiKey: 'test-key' } });
  expect(() => loadConfig({ ...valid, EMAIL_TRANSPORT: 'brevo' })).toThrow(/BREVO_API_KEY/);
});

test('D-033 the first Admin can come from ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (all three, or none)', () => {
  expect(loadConfig(valid).firstAdmin).toBeUndefined();
  const c = loadConfig({ ...valid, ADMIN_EMAIL: 'owner@x.test', ADMIN_NAME: 'Owner', ADMIN_PASSWORD: 'a-long-enough-password' });
  expect(c.firstAdmin).toEqual({ email: 'owner@x.test', name: 'Owner', password: 'a-long-enough-password' });
  expect(() => loadConfig({ ...valid, ADMIN_EMAIL: 'owner@x.test' })).toThrow(/ADMIN_NAME.*ADMIN_PASSWORD|ADMIN_PASSWORD/);
});

// D-051: keep a free Render service awake by pinging its own health URL.
test('keep-awake pings the Render URL every 10 minutes unless switched off', () => {
  expect(loadConfig({ ...valid, RENDER_EXTERNAL_URL: 'https://pm-crm.onrender.com/' }).keepAwake).toEqual({
    url: 'https://pm-crm.onrender.com/api/v1/health',
    everyMs: 600_000,
  });
  expect(loadConfig({ ...valid, KEEP_AWAKE_URL: 'https://x.test/api/v1/health' }).keepAwake?.url).toBe('https://x.test/api/v1/health');
  expect(loadConfig({ ...valid, RENDER_EXTERNAL_URL: 'https://pm-crm.onrender.com', KEEP_AWAKE: 'false' }).keepAwake).toBeUndefined();
  expect(loadConfig(valid).keepAwake).toBeUndefined();
});
