import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** Bring the test database to the latest migration once per run. */
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
