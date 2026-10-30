import { Inject, Injectable } from '@nestjs/common';
import { generateToken, hashToken } from '@salescrm/auth';
import { type AppConfig } from '@salescrm/config';
import { type AuthToken, type AuthTokenKind, type Prisma } from '@salescrm/database';
import { APP_CONFIG } from '../../config.module';
import { manageableRoles } from '@salescrm/auth/permissions';
import { AppError } from '../../common/errors';

const TTL_MS: Record<AuthTokenKind, number> = { INVITE: 72 * 3600_000, RESET: 24 * 3600_000 };
const PATH: Record<AuthTokenKind, string> = { INVITE: 'invite', RESET: 'reset' };

/** Single-use invite / reset links (D-010: returned to the Admin, not emailed). Only the token's HMAC is stored. */
@Injectable()
export class AuthTokensService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async issue(
    tx: Prisma.TransactionClient,
    kind: AuthTokenKind,
    data: { email: string; name?: string; role?: AuthToken['role']; userId?: string; createdById: string },
  ): Promise<{ id: string; url: string; expiresAt: Date }> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + TTL_MS[kind]);
    const row = await tx.authToken.create({
      data: {
        kind,
        tokenHash: hashToken(token, this.config.sessionSecret),
        email: data.email,
        name: data.name ?? null,
        role: data.role ?? null,
        userId: data.userId ?? null,
        createdById: data.createdById,
        expiresAt,
      },
    });
    return { id: row.id, url: `${this.config.webOrigin}/${PATH[kind]}/${token}`, expiresAt };
  }

  /**
   * Unused, unexpired, and its issuer may still manage that kind of account (an active Admin for any link, an active
   * CEO for Project Manager links, D-018) — a link must not outlive the authority that granted it.
   */
  private async findUsable(tx: Prisma.TransactionClient, kind: AuthTokenKind, token: string): Promise<AuthToken> {
    const row = await tx.authToken.findUnique({
      where: { tokenHash: hashToken(token, this.config.sessionSecret) },
      include: { createdBy: { select: { active: true, role: true } } },
    });
    const usable = row && row.kind === kind && !row.usedAt && row.expiresAt.getTime() > Date.now() && row.createdBy.active;
    if (!usable) throw this.invalid();
    // An invite carries the role it creates; a reset link acts on an existing account with its current role.
    const target =
      row.role ?? (row.userId ? (await tx.user.findUnique({ where: { id: row.userId }, select: { role: true } }))?.role : null);
    if (!target || !manageableRoles(row.createdBy.role).includes(target)) throw this.invalid();
    return row;
  }

  private invalid(): AppError {
    return new AppError(400, 'VALIDATION_FAILED', 'This link is invalid or has expired. Ask your admin for a new one.');
  }

  /** The usable token row, for showing an invite before it is accepted. */
  async peek(tx: Prisma.TransactionClient, kind: AuthTokenKind, token: string): Promise<AuthToken> {
    return this.findUsable(tx, kind, token);
  }

  /** Cheap pre-check for public routes, run before any expensive work. Not a reservation: `consume` decides. */
  async assertUsable(tx: Prisma.TransactionClient, kind: AuthTokenKind, token: string): Promise<void> {
    await this.findUsable(tx, kind, token);
  }

  /** Marks the token used in the caller's transaction; a concurrent second use finds nothing to update. */
  async consume(tx: Prisma.TransactionClient, kind: AuthTokenKind, token: string): Promise<AuthToken> {
    const row = await this.findUsable(tx, kind, token);
    const { count } = await tx.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (count !== 1) throw this.invalid();
    return row;
  }

  /** When an Admin or CEO is deactivated or demoted, every link they issued stops working. */
  async revokeIssuedBy(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.authToken.updateMany({ where: { createdById: userId, usedAt: null }, data: { usedAt: new Date() } });
  }
}
