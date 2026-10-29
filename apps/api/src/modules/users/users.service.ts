import { Injectable } from '@nestjs/common';
import { changedFields } from '@salescrm/core';
import { type InviteUserInput, type LinkResponse, type UpdateUserInput, type UserListItem } from '@salescrm/schemas';
import { type SessionUser } from '../../common/current-user';
import { conflict, notFound } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { AuthTokensService } from '../auth/auth-tokens.service';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: AuthTokensService,
  ) {}

  async list(): Promise<{ items: UserListItem[] }> {
    const users = await this.prisma.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
    };
  }

  async invite(actor: SessionUser, input: InviteUserInput): Promise<LinkResponse> {
    return this.prisma.$transaction(async (tx) => {
      // Any existing account, active or not, is managed via PATCH /users/:id instead of a second invite.
      if (await tx.user.findUnique({ where: { email: input.email } })) {
        throw conflict('CONFLICT', 'A user with this email already exists');
      }
      const link = await this.tokens.issue(tx, 'INVITE', { ...input, createdById: actor.id });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'user.invite',
        entity: 'AuthToken',
        entityId: link.id,
        after: { email: input.email, role: input.role },
      });
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    });
  }

  async update(actor: SessionUser, id: string, input: UpdateUserInput): Promise<UserListItem> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw notFound();
      const role = input.role ?? user.role;
      const active = input.active ?? user.active;

      const losesAdmin = user.role === 'ADMIN' && user.active && (role !== 'ADMIN' || !active);
      if (losesAdmin && (await tx.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } })) === 0) {
        throw conflict('LAST_ADMIN', 'At least one active admin must remain');
      }

      const updated = await tx.user.update({ where: { id }, data: { role, active } });
      const diff = changedFields({ role: user.role, active: user.active }, { role, active });
      if (diff) {
        await this.audit.record(tx, { actorId: actor.id, action: 'user.update', entity: 'User', entityId: id, ...diff });
        // A changed role or a deactivation takes effect immediately: end every session of that user.
        await tx.session.deleteMany({ where: { userId: id } });
      }
      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        active: updated.active,
        lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
      };
    });
  }

  async resetLink(actor: SessionUser, id: string): Promise<LinkResponse> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw notFound();
      const link = await this.tokens.issue(tx, 'RESET', { email: user.email, userId: user.id, createdById: actor.id });
      await this.audit.record(tx, { actorId: actor.id, action: 'user.reset_link', entity: 'User', entityId: id });
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    });
  }
}
