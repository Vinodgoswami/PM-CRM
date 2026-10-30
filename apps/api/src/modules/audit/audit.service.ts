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

export const ACCOUNT_ENTITIES = ['User', 'AuthToken', 'Setting'];

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

  /** `accountsOnly` (D-021, the Admin): user, sign-in and settings events; never clients, projects or money. */
  async list(filter: { entity?: string; entityId?: string; accountsOnly?: boolean }, page: number, pageSize: number) {
    const where = {
      AND: [
        filter.entity ? { entity: filter.entity } : {},
        filter.entityId ? { entityId: filter.entityId } : {},
        filter.accountsOnly ? { entity: { in: ACCOUNT_ENTITIES } } : {},
      ],
    };
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
