import { type Permission, scopeFor } from '@salescrm/auth/permissions';
import { type SessionUser } from './current-user';
import { forbidden, notFound } from './errors';

/**
 * For "own" scopes. Reads of someone else's record return 404 so its existence is not revealed (docs/07);
 * writes return 403.
 */
export function assertCanAccess(user: SessionUser, permission: Permission, ownerId: string, mode: 'read' | 'write'): void {
  const scope = scopeFor(user.role, permission);
  const allowed = scope === 'all' || (scope === 'own' && ownerId === user.id);
  if (!allowed) throw mode === 'read' ? notFound() : forbidden();
}

/** Prisma `where` fragment that limits list queries to what the user may see. */
export function ownerWhere(user: SessionUser, permission: Permission): { ownerId?: string } {
  const scope = scopeFor(user.role, permission);
  if (scope === false) throw forbidden();
  return scope === 'own' ? { ownerId: user.id } : {};
}
