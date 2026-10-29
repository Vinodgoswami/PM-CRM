import { type Role } from '@salescrm/types';

/**
 * The permission matrix from docs/07-roles-and-permissions.md, as data. Browser-safe (no Node imports):
 * the web app imports this same file to show or hide UI; the API enforces it.
 */
export type Scope = 'all' | 'own' | false;

export const PERMISSIONS = {
  'dashboard.company': { ADMIN: 'all', SALES: false, CEO: 'all' },
  'dashboard.own': { ADMIN: 'all', SALES: 'all', CEO: 'all' },
  'invoices.read': { ADMIN: 'all', SALES: 'own', CEO: 'all' },
  'billing.read': { ADMIN: 'all', SALES: 'own', CEO: 'all' },
  export: { ADMIN: 'all', SALES: 'own', CEO: 'all' },
  // Q-01 provisional default: Sales may view every project, edit only their own.
  'projects.read': { ADMIN: 'all', SALES: 'all', CEO: 'all' },
  'clients.read': { ADMIN: 'all', SALES: 'all', CEO: 'all' },
  'projects.write': { ADMIN: 'all', SALES: 'own', CEO: false },
  'clients.write': { ADMIN: 'all', SALES: 'all', CEO: false },
  'payments.create': { ADMIN: 'all', SALES: 'own', CEO: false },
  'payments.editMeta': { ADMIN: 'all', SALES: 'own', CEO: false },
  'payments.reverse': { ADMIN: 'all', SALES: false, CEO: false },
  'projects.reassign': { ADMIN: 'all', SALES: false, CEO: false },
  'users.manage': { ADMIN: 'all', SALES: false, CEO: false },
  'settings.manage': { ADMIN: 'all', SALES: false, CEO: false },
  'audit.read': { ADMIN: 'all', SALES: false, CEO: 'all' },
} as const satisfies Record<string, Record<Role, Scope>>;

export type Permission = keyof typeof PERMISSIONS;

export function scopeFor(role: Role, permission: Permission): Scope {
  return PERMISSIONS[permission][role];
}

/** Without a resource: may the user do this to anything? With one: to this one? */
export function can(user: { id: string; role: Role }, permission: Permission, resource?: { ownerId: string }): boolean {
  const scope = scopeFor(user.role, permission);
  if (scope === false) return false;
  if (scope === 'own' && resource) return resource.ownerId === user.id;
  return true;
}
