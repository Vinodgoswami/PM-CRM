import { Inject, Injectable } from '@nestjs/common';
import { generateToken, hashToken } from '@salescrm/auth';
import { type AppConfig } from '@salescrm/config';
import { type AuthToken, type AuthTokenKind, type Prisma } from '@salescrm/database';
import { APP_CONFIG } from '../../config.module';
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

  /** Marks the token used in the caller's transaction; a concurrent second use finds nothing to update. */
  async consume(tx: Prisma.TransactionClient, kind: AuthTokenKind, token: string): Promise<AuthToken> {
    const invalid = new AppError(400, 'VALIDATION_FAILED', 'This link is invalid or has expired. Ask your admin for a new one.');
    const row = await tx.authToken.findUnique({ where: { tokenHash: hashToken(token, this.config.sessionSecret) } });
    if (!row || row.kind !== kind || row.usedAt || row.expiresAt.getTime() <= Date.now()) throw invalid;
    const { count } = await tx.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (count !== 1) throw invalid;
    return row;
  }
}
