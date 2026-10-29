import path from 'node:path';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch {
  /* CI provides env directly */
}
const baseUrl = process.env.TEST_DATABASE_URL;
if (!baseUrl) throw new Error('TEST_DATABASE_URL is required for database tests (start it with `pnpm db:local`).');
// Own schema: Turborepo runs this suite in parallel with the API suite, which truncates the default schema.
const url = new URL(baseUrl);
url.searchParams.set('schema', 'database_pkg_test');
const testUrl = url.toString();
process.env.TEST_DATABASE_URL = testUrl;

export default defineConfig({
  test: {
    env: { DATABASE_URL: testUrl },
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
