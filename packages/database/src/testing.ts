import { type PrismaClient } from '@prisma/client';

/** Empties every application table. TRUNCATE does not fire the row-level money/audit guard triggers. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename.replaceAll('"', '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`); // security-baseline-allow: table names come from pg_tables, test-only helper
}
