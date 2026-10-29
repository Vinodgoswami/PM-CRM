import { Inject, Injectable } from '@nestjs/common';
import { csrfTokenFor, hashPassword, verifyPassword } from '@salescrm/auth';
import { type AppConfig } from '@salescrm/config';
import { type LoginInput, type SessionResponse } from '@salescrm/schemas';
import { APP_CONFIG } from '../../config.module';
import { type SessionUser } from '../../common/current-user';
import { rateLimited, unauthenticated } from '../../common/errors';
import { PrismaService } from '../prisma/prisma.module';
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
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(input: LoginInput, ip: string, userAgent: string | undefined): Promise<SessionResponse & { token: string }> {
    const since = new Date(Date.now() - FAILURE_WINDOW_MS);
    const failures = await this.prisma.loginAttempt.count({ where: { email: input.email, ip, success: false, at: { gte: since } } });
    if (failures >= MAX_FAILURES) throw rateLimited('Too many attempts. Try again in 15 minutes.');

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Always run argon2 so unknown emails take as long as wrong passwords.
    const hash = user?.passwordHash ?? (await (this.dummyHash ??= hashPassword('timing-equaliser-not-a-password')));
    const ok = (await verifyPassword(hash, input.password)) && !!user?.passwordHash && user.active;

    await this.prisma.loginAttempt.create({ data: { email: input.email, ip, success: ok } });
    if (!ok || !user) throw unauthenticated(INVALID);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const { token } = await this.sessions.create(user.id, ip, userAgent);
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      csrfToken: csrfTokenFor(token, this.config.sessionSecret),
    };
  }

  sessionResponse(user: SessionUser, token: string): SessionResponse {
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      csrfToken: csrfTokenFor(token, this.config.sessionSecret),
    };
  }
}
