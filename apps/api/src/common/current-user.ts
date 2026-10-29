import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Role } from '@salescrm/types';
import { type Request } from 'express';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express augments its Request type via this namespace.
  namespace Express {
    interface Request {
      user?: SessionUser;
      /** Raw session token from the cookie; used only to derive the CSRF token. */
      sessionToken?: string;
    }
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const user = ctx.switchToHttp().getRequest<Request>().user;
  if (!user) throw new Error('CurrentUser used on a route without a session');
  return user;
});
