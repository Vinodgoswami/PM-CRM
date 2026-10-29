import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission, scopeFor } from '@salescrm/auth/permissions';
import { type Request } from 'express';
import { IS_AUTHENTICATED, IS_PUBLIC, REQUIRED_PERMISSION } from './decorators';
import { forbidden } from './errors';

/**
 * Default-deny: every non-public handler must declare @Authenticated() or @RequirePermission(…).
 * A forgotten decorator fails closed instead of exposing the route.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user) throw forbidden();

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, targets);
    if (permission) {
      if (scopeFor(user.role, permission) === false) throw forbidden();
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED, targets)) return true;
    throw forbidden();
  }
}
