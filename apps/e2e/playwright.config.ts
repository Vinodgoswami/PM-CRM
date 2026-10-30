import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end flows F1–F5 (docs/08) against a real API, web app and PostgreSQL database.
 * Own ports and database (salescrm_e2e) so it can run beside `pnpm dev`. Build first: `pnpm build`.
 */
const API_PORT = 4100;
const WEB_PORT = 5190;
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://salescrm:salescrm@localhost:5432/salescrm_e2e';
export const SEED_PASSWORD = 'e2e-only-password';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'node start-api.mjs',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL: DB,
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        SEED_PASSWORD,
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_DIR: './.e2e-uploads',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `pnpm --filter @salescrm/web exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
