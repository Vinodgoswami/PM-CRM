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
  });
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
  const config = loadConfig({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'true', WEB_ORIGIN: 'https://crm.example.com' });
  expect(config.cookieSecure).toBe(true);
});
