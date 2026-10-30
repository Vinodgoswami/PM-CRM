import { Injectable } from '@nestjs/common';
import { manageableRoles } from '@salescrm/auth/permissions';
import { changedFields } from '@salescrm/core';
import { type InviteUserInput, type LinkResponse, type UpdateUserInput, type UserListItem } from '@salescrm/schemas';
import { type Role } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { AppError, conflict, forbidden, notFound } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { AuthTokensService } from '../auth/auth-tokens.service';
import { type Prisma } from '@salescrm/database';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.module';

const ROLE_NAME: Record<Role, string> = { ADMIN: 'Admin', CEO: 'CEO', SALES: 'Project Manager' };
/** Your own role, status and password are managed from your profile, never from the users list. */
const notYourself = () => new AppError(400, 'VALIDATION_FAILED', 'Manage your own account from your profile.');
type ItemRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: Date | null;
  manager: { id: string; name: string } | null;
};
const toItem = (u: ItemRow): UserListItem => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  manager: u.manager,
});

/** D-024: the id of an active CEO, or a 400. */
async function activeCeo(tx: Prisma.TransactionClient, id: string): Promise<string> {
  const ceo = await tx.user.findUnique({ where: { id }, select: { role: true, active: true } });
  if (!ceo || ceo.role !== 'CEO' || !ceo.active) throw new AppError(400, 'VALIDATION_FAILED', 'Choose an active CEO.');
  return id;
}

/** Role check plus D-024's team check: a CEO manages only the project managers who report to them. */
const assertManagesUser = (actor: SessionUser, user: { role: Role; managerId: string | null }) => {
  assertManages(actor, user.role);
  if (actor.role === 'CEO' && user.managerId !== actor.id) throw forbidden('This project manager reports to another CEO.');
};

const assertManages = (actor: SessionUser, role: Role) => {
  if (!manageableRoles(actor.role).includes(role)) throw forbidden(`Only an Admin can manage ${ROLE_NAME[role]} accounts.`);
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: AuthTokensService,
    private readonly mail: MailService,
  ) {}

  /** Emails an invite after it is saved; the link is returned either way, with `emailed` saying which. */
  private async emailInvite(actor: SessionUser, to: string, name: string | null, role: Role, link: { url: string; expiresAt: Date }) {
    const company = (await this.prisma.setting.findUnique({ where: { id: 1 }, select: { companyName: true } }))?.companyName ?? '';
    const emailed = await this.mail.trySend(this.mail.invite({ to, name, role, company, invitedBy: actor.name, ...link }));
    return { url: link.url, expiresAt: link.expiresAt.toISOString(), emailed };
  }

  /**
   * D-024: everyone except yourself (your account is on Profile). A CEO sees only the project managers who report
   * to them; the Admin sees everyone.
   */
  async list(actor: SessionUser): Promise<{ items: UserListItem[] }> {
    const users = await this.prisma.user.findMany({
      where: { id: { not: actor.id }, ...(actor.role === 'CEO' ? { role: 'SALES', managerId: actor.id } : {}) },
      include: { manager: { select: { id: true, name: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return { items: users.map(toItem) };
  }

  async invite(actor: SessionUser, input: InviteUserInput): Promise<LinkResponse> {
    const link = await this.prisma.$transaction(async (tx) => {
      if (!manageableRoles(actor.role).includes(input.role)) throw forbidden(`You cannot add a ${ROLE_NAME[input.role]}.`);
      // Any existing account, active or not, is managed via PATCH /users/:id instead of a second invite.
      if (await tx.user.findUnique({ where: { email: input.email } })) {
        throw conflict('CONFLICT', 'A user with this email already exists');
      }
      // A new invite for the same email replaces any pending one, so only the latest link works.
      await tx.authToken.updateMany({ where: { kind: 'INVITE', email: input.email, usedAt: null }, data: { usedAt: new Date() } });
      // D-024: a project manager joins a team — the inviting CEO's, or the one the Admin chose.
      const managerId =
        input.role !== 'SALES' ? null : actor.role === 'CEO' ? actor.id : input.managerId ? await activeCeo(tx, input.managerId) : null;
      const link = await this.tokens.issue(tx, 'INVITE', {
        email: input.email,
        name: input.name,
        role: input.role,
        createdById: actor.id,
        managerId,
      });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'user.invite',
        entity: 'AuthToken',
        entityId: link.id,
        after: { email: input.email, role: input.role },
      });
      return link;
    });
    return this.emailInvite(actor, input.email, input.name, input.role, link);
  }

  async update(actor: SessionUser, id: string, input: UpdateUserInput): Promise<UserListItem> {
    return this.prisma.$transaction(async (tx) => {
      // Lock every active admin row first (fixed order, no deadlock). Two admins demoting each other at once
      // would otherwise both count "one other admin left" and commit, leaving none (write skew).
      await tx.$queryRaw`SELECT id FROM "User" WHERE role = 'ADMIN' AND active = true ORDER BY id FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw notFound();
      if (id === actor.id) throw notYourself();
      const role = input.role ?? user.role;
      const active = input.active ?? user.active;
      assertManagesUser(actor, user);
      assertManages(actor, role);

      const losesAdmin = user.role === 'ADMIN' && user.active && (role !== 'ADMIN' || !active);
      if (losesAdmin && (await tx.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } })) === 0) {
        throw conflict('LAST_ADMIN', 'At least one active admin must remain');
      }

      // D-024: only the Admin moves a project manager between teams; the new manager must be an active CEO.
      let managerId = user.managerId;
      if (input.managerId !== undefined) {
        if (actor.role !== 'ADMIN') throw forbidden('Only the Admin can change who a project manager reports to.');
        managerId = input.managerId === null ? null : await activeCeo(tx, input.managerId);
      }
      if (role !== 'SALES') managerId = null;
      const updated = await tx.user.update({
        where: { id },
        data: { role, active, managerId },
        include: { manager: { select: { id: true, name: true } } },
      });
      const diff = changedFields({ role: user.role, active: user.active, managerId: user.managerId }, { role, active, managerId });
      if (diff) {
        await this.audit.record(tx, { actorId: actor.id, action: 'user.update', entity: 'User', entityId: id, ...diff });
        // A changed role or a deactivation takes effect immediately: end every session of that user.
        await tx.session.deleteMany({ where: { userId: id } });
        // Links an admin issued die with their admin rights.
        // Anyone who could issue links (Admin, CEO) and loses that role or is deactivated: their unused links die.
        const losesAuthority = user.role !== 'SALES' && user.active && (role !== user.role || !active);
        if (losesAuthority) await this.tokens.revokeIssuedBy(tx, id);
      }
      return toItem(updated);
    });
  }

  async resetLink(actor: SessionUser, id: string): Promise<LinkResponse> {
    const { user, link } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw notFound();
      if (id === actor.id) throw notYourself();
      assertManagesUser(actor, user);
      const link = await this.tokens.issue(tx, 'RESET', { email: user.email, userId: user.id, createdById: actor.id });
      await this.audit.record(tx, { actorId: actor.id, action: 'user.reset_link', entity: 'User', entityId: id });
      return { user, link };
    });
    const emailed = await this.mail.trySend(this.mail.reset({ to: user.email, name: user.name, ...link }));
    return { url: link.url, expiresAt: link.expiresAt.toISOString(), emailed };
  }

  /** Invites not yet accepted (and not expired), for roles the viewer may manage. */
  async listInvites(actor: SessionUser) {
    const rows = await this.prisma.authToken.findMany({
      where: {
        kind: 'INVITE',
        usedAt: null,
        expiresAt: { gt: new Date() },
        role: { in: manageableRoles(actor.role) },
        ...(actor.role === 'CEO' ? { managerId: actor.id } : {}),
      },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role!,
        expiresAt: r.expiresAt.toISOString(),
        invitedBy: r.createdBy.name,
      })),
    };
  }

  private async pendingInvite(tx: Prisma.TransactionClient, actor: SessionUser, id: string) {
    const row = await tx.authToken.findUnique({ where: { id } });
    if (!row || row.kind !== 'INVITE' || row.usedAt || !row.role) throw notFound();
    assertManages(actor, row.role);
    if (actor.role === 'CEO' && row.managerId !== actor.id) throw forbidden('This invite belongs to another team.');
    return row;
  }

  /** A fresh link for a pending invite; the old link stops working. */
  async resendInvite(actor: SessionUser, id: string): Promise<LinkResponse> {
    const { old, link } = await this.prisma.$transaction(async (tx) => {
      const old = await this.pendingInvite(tx, actor, id);
      await tx.authToken.update({ where: { id }, data: { usedAt: new Date() } });
      const link = await this.tokens.issue(tx, 'INVITE', {
        email: old.email,
        ...(old.name ? { name: old.name } : {}),
        role: old.role!,
        createdById: actor.id,
        managerId: old.managerId,
      });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'user.invite_resend',
        entity: 'AuthToken',
        entityId: link.id,
        after: { email: old.email },
      });
      return { old, link };
    });
    return this.emailInvite(actor, old.email, old.name, old.role!, link);
  }

  async cancelInvite(actor: SessionUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.pendingInvite(tx, actor, id);
      await tx.authToken.update({ where: { id }, data: { usedAt: new Date() } });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'user.invite_cancel',
        entity: 'AuthToken',
        entityId: id,
        after: { email: row.email },
      });
    });
  }
}
