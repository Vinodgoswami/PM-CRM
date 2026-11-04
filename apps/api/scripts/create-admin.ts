/**
 * Creates the very first Admin of a fresh (production) database: `pnpm --filter @salescrm/api create-admin`.
 * Production has no demo seed; after this the Admin invites the CEO, who invites the project managers.
 * Email and name come from ADMIN_EMAIL / ADMIN_NAME (or are asked for); the password is always typed at a hidden
 * prompt and never printed or taken from the environment.
 */
import { createInterface } from 'node:readline';
import { createPrismaClient } from '@salescrm/database';
import { createFirstAdmin } from '../src/modules/users/first-admin';

export { createFirstAdmin };

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Echo nothing while the password is typed.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.startsWith(question)) process.stdout.write(question);
    };
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    }),
  );
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL to the production database (e.g. the Neon connection string) first.');
    process.exit(1);
  }
  const email = process.env.ADMIN_EMAIL ?? (await ask('Admin email: '));
  const name = process.env.ADMIN_NAME ?? (await ask('Admin name: '));
  const password = await ask('Password (at least 10 characters, not shown): ', true);
  const again = await ask('Type it again: ', true);
  if (password !== again) {
    console.error('The passwords do not match. Nothing was created.');
    process.exit(1);
  }
  const prisma = createPrismaClient(process.env.DATABASE_URL);
  try {
    const admin = await createFirstAdmin(prisma, { email, name, password });
    console.warn(`Admin ${admin.email} created. Sign in, then invite the CEO from Users.`);
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
