import os from 'node:os';
import path from 'node:path';
import { type AppConfig } from '@salescrm/config';

/** Config for in-process test apps; never read from the real environment. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 4000,
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://salescrm:salescrm@localhost:5432/salescrm_test',
    sessionSecret: 'test-only-session-secret-0000000000000000000000',
    webOrigin: 'http://localhost:5173',
    cookieSecure: false,
    logLevel: 'silent',
    storage: { driver: 'local', localDir: path.join(os.tmpdir(), 'salescrm-test-uploads') },
    fx: { provider: 'fixed' },
    email: { transport: 'log', from: 'Project Management CRM <no-reply@test>' },
    ...overrides,
  };
}
