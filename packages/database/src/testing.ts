import { type PrismaClient } from '@prisma/client';

/** Empties every application table. TRUNCATE does not fire the row-level money/audit guard triggers. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename.replaceAll('"', '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`); // security-baseline-allow: table names come from pg_tables, test-only helper
  // Standalone sequences are not owned by a table, so RESTART IDENTITY leaves them alone.
  await prisma.$executeRaw`ALTER SEQUENCE IF EXISTS project_code_seq RESTART WITH 1`;
}
