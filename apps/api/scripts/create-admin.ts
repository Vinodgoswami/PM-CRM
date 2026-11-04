/**
 * Creates the very first Admin of a fresh (production) database: `pnpm --filter @salescrm/api create-admin`.
 * Production has no demo seed; after this the Admin invites the CEO, who invites the project managers.
 * Email and name come from ADMIN_EMAIL / ADMIN_NAME (or are asked for); the password is always typed at a hidden
 * prompt and never printed or taken from the environment.
 */
import { createInterface } from 'node:readline';
import { hashPassword } from '@salescrm/auth';
import { createPrismaClient, type PrismaClient } from '@salescrm/database';
import { emailSchema, passwordSchema } from '@salescrm/schemas';

export async function createFirstAdmin(
  prisma: PrismaClient,
  input: { email: string; name: string; password: string },
): Promise<{ id: string; email: string }> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw new Error(email.error.issues[0]!.message);
  const password = passwordSchema.safeParse(input.password);
  if (!password.success) throw new Error(password.error.issues[0]!.message);
  const name = input.name.trim();
  if (!name) throw new Error('Enter a name');
  if ((await prisma.user.count({ where: { role: 'ADMIN' } })) > 0) {
    throw new Error('This database already has an Admin. Sign in, or ask them for a reset link.');
  }
  const user = await prisma.user.create({
    data: { email: email.data, name, role: 'ADMIN', passwordHash: await hashPassword(password.data) },
  });
  return { id: user.id, email: user.email };
}

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
