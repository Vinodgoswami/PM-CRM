import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
