import path from 'node:path';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch {
  /* CI provides env directly */
}
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required for database tests (start it with `pnpm db:local`).');

export default defineConfig({
  test: {
    env: { DATABASE_URL: testUrl },
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
