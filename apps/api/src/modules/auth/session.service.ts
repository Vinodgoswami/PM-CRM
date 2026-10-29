import { Inject, Injectable } from '@nestjs/common';
import { generateToken, hashToken } from '@salescrm/auth';
import { type AppConfig } from '@salescrm/config';
import { APP_CONFIG } from '../../config.module';
import { type SessionUser } from '../../common/current-user';
import { PrismaService } from '../prisma/prisma.module';

export const SESSION_COOKIE = 'sc_session';
export const IDLE_TIMEOUT_MS = 12 * 3600_000;
export const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 3600_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(userId: string, ip: string | undefined, userAgent: string | undefined): Promise<{ token: string }> {
    const token = generateToken();
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token, this.config.sessionSecret),
        userId,
        expiresAt: new Date(Date.now() + ABSOLUTE_TIMEOUT_MS),
        ip: ip ?? null,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
    return { token };
  }

  async resolve(token: string): Promise<SessionUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token, this.config.sessionSecret) },
      include: { user: true },
    });
    if (!session) return null;
    const now = Date.now();
    const expired = session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS;
    if (expired || !session.user.active) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
    }
    const { user } = session;
    return { id: user.id, name: user.name, email: user.email, role: user.role, sessionId: session.id };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
