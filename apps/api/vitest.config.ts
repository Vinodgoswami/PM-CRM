import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch {
  /* CI provides env directly */
}
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required for API tests (start it with `pnpm db:local`).');

// SWC is required so NestJS decorator metadata (constructor injection) works under Vitest.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    env: { DATABASE_URL: testUrl },
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
