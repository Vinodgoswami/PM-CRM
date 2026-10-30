import { type Role } from '@salescrm/types';

/**
 * The permission matrix from docs/07-roles-and-permissions.md, as data. Browser-safe (no Node imports):
 * the web app imports this same file to show or hide UI; the API enforces it.
 */
export type Scope = 'all' | 'own' | false;

export const PERMISSIONS = {
  // D-021: the Admin manages accounts and sees counts only; clients, projects and money are the CEO's and PMs'.
  'admin.overview': { ADMIN: 'all', SALES: false, CEO: false },
  // D-022: the Admin sees the business figures on the dashboard with client and project names left out.
  'dashboard.company': { ADMIN: 'all', SALES: false, CEO: 'all' },
  'dashboard.own': { ADMIN: 'all', SALES: 'all', CEO: 'all' },
  'invoices.read': { ADMIN: false, SALES: 'own', CEO: 'all' },
  'billing.read': { ADMIN: false, SALES: 'own', CEO: 'all' },
  export: { ADMIN: false, SALES: 'own', CEO: 'all' },
  // Q-01 provisional default: project managers may view every project, edit only their own.
  'projects.read': { ADMIN: false, SALES: 'all', CEO: 'all' },
  'clients.read': { ADMIN: false, SALES: 'all', CEO: 'all' },
  // D-018: the CEO works on any project alongside the project managers.
  'projects.write': { ADMIN: false, SALES: 'own', CEO: 'all' },
  'clients.write': { ADMIN: false, SALES: 'all', CEO: 'all' },
  'payments.create': { ADMIN: false, SALES: 'own', CEO: 'all' },
  'payments.editMeta': { ADMIN: false, SALES: 'own', CEO: 'all' },
  'payments.reverse': { ADMIN: false, SALES: false, CEO: 'all' },
  'projects.reassign': { ADMIN: false, SALES: false, CEO: 'all' },
  // Which accounts each role may add or manage is narrowed by manageableRoles().
  'users.manage': { ADMIN: 'all', SALES: false, CEO: 'all' },
  /** The company name only. */
  'settings.company': { ADMIN: 'all', SALES: false, CEO: 'all' },
  /** Currency, financial year, time zone, due-soon days, and CSV import. */
  'settings.manage': { ADMIN: false, SALES: false, CEO: 'all' },
  /** The audit log: the Admin sees account events only (audit.business adds client, project and money events). */
  'audit.read': { ADMIN: 'all', SALES: false, CEO: 'all' },
  'audit.business': { ADMIN: false, SALES: false, CEO: 'all' },
} as const satisfies Record<string, Record<Role, Scope>>;

export type Permission = keyof typeof PERMISSIONS;

/** D-018: the Admin adds anyone (including CEOs); the CEO adds and manages Project Managers (SALES) only. */
export function manageableRoles(role: Role): Role[] {
  if (role === 'ADMIN') return ['ADMIN', 'CEO', 'SALES'];
  if (role === 'CEO') return ['SALES'];
  return [];
}

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
