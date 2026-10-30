import { Inject, Injectable } from '@nestjs/common';
import { csrfTokenFor, hashPassword, verifyPassword } from '@salescrm/auth';
import { type AppConfig } from '@salescrm/config';
import {
  type AcceptInviteInput,
  type ChangePasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SessionResponse,
} from '@salescrm/schemas';
import { APP_CONFIG } from '../../config.module';
import { type SessionUser } from '../../common/current-user';
import { AppError, rateLimited, unauthenticated } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.module';
import { AuthTokensService } from './auth-tokens.service';
import { avatarUrlFor } from '../users/avatar-url';
import { SessionService } from './session.service';

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
const INVALID = 'Invalid email or password';

@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly tokens: AuthTokensService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(input: LoginInput, ip: string, userAgent: string | undefined): Promise<SessionResponse & { token: string }> {
    // Serialise attempts per (email, IP): without the lock a parallel burst reads a stale failure count and
    // every request gets a guess (check-then-act race).
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`login:${input.email}|${ip}`}))`;
        const since = new Date(Date.now() - FAILURE_WINDOW_MS);
        const failures = await tx.loginAttempt.count({ where: { email: input.email, ip, success: false, at: { gte: since } } });
        if (failures >= MAX_FAILURES) return { limited: true as const };

        const user = await tx.user.findUnique({ where: { email: input.email } });
        // Always run argon2 so unknown emails take as long as wrong passwords.
        const hash = user?.passwordHash ?? (await (this.dummyHash ??= hashPassword('timing-equaliser-not-a-password')));
        const ok = (await verifyPassword(hash, input.password)) && !!user?.passwordHash && user.active;
        await tx.loginAttempt.create({ data: { email: input.email, ip, success: ok } });
        return { limited: false as const, user: ok ? user : null };
      },
      { timeout: 30_000 },
    );
    if (outcome.limited) throw rateLimited('Too many attempts. Try again in 15 minutes.');
    const { user } = outcome;
    if (!user) throw unauthenticated(INVALID);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const { token } = await this.sessions.create(user.id, ip, userAgent);
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: avatarUrlFor(user.id, user.avatarKey) },
      csrfToken: csrfTokenFor(token, this.config.sessionSecret),
    };
  }

  sessionResponse(user: SessionUser, token: string): SessionResponse {
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: avatarUrlFor(user.id, user.avatarKey) },
      csrfToken: csrfTokenFor(token, this.config.sessionSecret),
    };
  }

  async acceptInvite(input: AcceptInviteInput, ip: string, userAgent: string | undefined): Promise<SessionResponse & { token: string }> {
    // Reject bad tokens before the ~64 MiB argon2 hash, so junk requests to this public route stay cheap.
    await this.tokens.assertUsable(this.prisma, 'INVITE', input.token);
    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const invite = await this.tokens.consume(tx, 'INVITE', input.token);
      if (!invite.role) throw new AppError(400, 'VALIDATION_FAILED', 'This invite has no role');
      if (await tx.user.findUnique({ where: { email: invite.email } })) {
        throw new AppError(400, 'VALIDATION_FAILED', 'An account with this email already exists. Sign in instead.');
      }
      const created = await tx.user.create({
        data: { email: invite.email, name: input.name, role: invite.role, passwordHash, lastLoginAt: new Date() },
      });
      await this.audit.record(tx, {
        actorId: created.id,
        action: 'user.accept_invite',
        entity: 'User',
        entityId: created.id,
        after: { email: created.email, role: created.role },
      });
      return created;
    });
    const { token } = await this.sessions.create(user.id, ip, userAgent);
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: avatarUrlFor(user.id, user.avatarKey) },
      csrfToken: csrfTokenFor(token, this.config.sessionSecret),
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await this.tokens.assertUsable(this.prisma, 'RESET', input.token);
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      const reset = await this.tokens.consume(tx, 'RESET', input.token);
      if (!reset.userId) throw new AppError(400, 'VALIDATION_FAILED', 'This link is invalid or has expired.');
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      // Anyone holding an old session (or the old password) is locked out.
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      await this.audit.record(tx, { actorId: reset.userId, action: 'user.reset_password', entity: 'User', entityId: reset.userId });
    });
  }

  /** Profile: needs the current password; every other session of this user ends, this one stays. */
  async changePassword(user: SessionUser, input: ChangePasswordInput): Promise<void> {
    const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!row?.passwordHash || !(await verifyPassword(row.passwordHash, input.currentPassword))) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Your current password is not correct.');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
      await this.audit.record(tx, { actorId: user.id, action: 'user.change_password', entity: 'User', entityId: user.id });
    });
  }
}
