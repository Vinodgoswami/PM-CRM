import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { SESSION_COOKIE, SessionService } from '../modules/auth/session.service';
import { IS_PUBLIC } from './decorators';
import { unauthenticated } from './errors';

/** Global: every route needs a valid session unless marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) throw unauthenticated();
    const user = await this.sessions.resolve(token);
    if (!user) throw unauthenticated('Your session has ended. Please sign in again.');
    req.user = user;
    req.sessionToken = token;
    return true;
  }
}
