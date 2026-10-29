import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { csrfTokenFor, safeEqual } from '@salescrm/auth';
import { type AppConfig } from '@salescrm/config';
import { type Request } from 'express';
import { APP_CONFIG } from '../config.module';
import { forbidden } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Mutations must come from our web origin and, once signed in, carry the session-bound X-CSRF-Token.
 * Runs after SessionGuard so req.sessionToken is known.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    if (origin !== undefined && origin !== this.config.webOrigin) throw forbidden('Request origin not allowed');

    if (req.sessionToken) {
      const header = req.headers['x-csrf-token'];
      const expected = csrfTokenFor(req.sessionToken, this.config.sessionSecret);
      if (typeof header !== 'string' || !safeEqual(header, expected)) throw forbidden('Missing or invalid CSRF token');
    }
    return true;
  }
}
