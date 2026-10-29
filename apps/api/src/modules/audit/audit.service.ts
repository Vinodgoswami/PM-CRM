import { Injectable } from '@nestjs/common';
import { type Prisma } from '@salescrm/database';
import { PrismaService } from '../prisma/prisma.module';

export interface AuditEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: object;
  after?: object;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Call inside the business transaction (D-012) so the change and its audit row commit together. */
  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: entry.ip ?? null,
      },
    });
  }

  async list(filter: { entity?: string; entityId?: string }, page: number, pageSize: number) {
    const where = { ...(filter.entity ? { entity: filter.entity } : {}), ...(filter.entityId ? { entityId: filter.entityId } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { id: true, name: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }
}
