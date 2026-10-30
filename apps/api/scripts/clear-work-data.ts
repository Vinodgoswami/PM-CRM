/**
 * Start fresh: `pnpm db:clear-work --yes`. Deletes every client, project, milestone, payment, extra work entry,
 * document (and its stored file) and the audit history. Keeps user accounts, sessions, invite links and company
 * settings, so everyone can sign in and enter real work. Local databases only (same guard as the seed).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createPrismaClient, type PrismaClient } from '@salescrm/database';
import { assertSafeToSeed } from './seed';

export interface ClearSummary {
  clients: number;
  projects: number;
  payments: number;
  documents: number;
  files: number;
}

export async function clearWorkData(prisma: PrismaClient, storageDir?: string): Promise<ClearSummary> {
  const [clients, projects, payments, docs] = await Promise.all([
    prisma.client.count(),
    prisma.project.count(),
    prisma.payment.count(),
    prisma.document.findMany({ select: { storageKey: true } }),
  ]);
  // TRUNCATE does not fire the row-level money/audit guard triggers, which (rightly) refuse row deletes.
  await prisma.$transaction([
    prisma.$executeRaw`TRUNCATE "Payment", "Milestone", "UpsellEntry", "Document", "Project", "ClientContact", "Client", "AuditLog" RESTART IDENTITY CASCADE`,
    prisma.$executeRaw`ALTER SEQUENCE IF EXISTS project_code_seq RESTART WITH 1`,
  ]);
  let files = 0;
  if (storageDir) {
    const root = path.resolve(storageDir);
    for (const { storageKey } of docs) {
      const full = path.resolve(root, storageKey);
      if (!full.startsWith(root + path.sep)) continue; // never step outside the storage folder
      await fs.rm(full, { force: true });
      files += 1;
    }
  }
  return { clients, projects, payments, documents: docs.length, files };
}

async function main(): Promise<void> {
  if (!process.argv.includes('--yes')) {
    console.error('This deletes every client, project, payment, document and the audit history. Run again with --yes to confirm.');
    process.exit(1);
  }
  try {
    assertSafeToSeed(process.env, process.argv);
  } catch (e) {
    console.error((e as Error).message.replace('seed', 'clear'));
    process.exit(1);
  }
  const prisma = createPrismaClient(process.env.DATABASE_URL);
  try {
    const local = (process.env.STORAGE_DRIVER ?? 'local') === 'local';
    const s = await clearWorkData(prisma, local ? (process.env.STORAGE_LOCAL_DIR ?? './uploads') : undefined);
    console.warn(
      `Cleared ${s.clients} clients, ${s.projects} projects, ${s.payments} payments, ${s.documents} documents (${s.files} files) and the audit history.\n` +
        'Users and company settings were kept.' +
        (local ? '' : ' Files in the S3 bucket were not touched.'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
