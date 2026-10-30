import { expect, test } from 'vitest';
import { can, manageableRoles, type Permission, PERMISSIONS, type Scope, scopeFor } from '../src/permissions';

// Row by row from docs/07-roles-and-permissions.md § Permission matrix: [ADMIN, SALES, CEO].
const MATRIX: [Permission, Scope, Scope, Scope][] = [
  // D-021: the Admin manages accounts and sees counts only; clients, projects and money belong to the CEO and PMs.
  ['admin.overview', 'all', false, false],
  // D-022: the Admin sees the business figures (names hidden), not client or project records.
  ['dashboard.company', 'all', false, 'all'],
  ['dashboard.own', 'all', 'all', 'all'],
  ['invoices.read', false, 'own', 'all'],
  ['billing.read', false, 'own', 'all'],
  ['export', false, 'own', 'all'],
  ['projects.read', false, 'all', 'all'],
  ['clients.read', false, 'all', 'all'],
  ['projects.write', false, 'own', 'all'],
  ['clients.write', false, 'all', 'all'],
  ['payments.create', false, 'own', 'all'],
  ['payments.editMeta', false, 'own', 'all'],
  ['payments.reverse', false, false, 'all'],
  ['projects.reassign', false, false, 'all'],
  ['users.manage', 'all', false, 'all'],
  ['settings.company', 'all', false, 'all'],
  ['settings.manage', false, false, 'all'],
  ['audit.read', 'all', false, 'all'],
  ['audit.business', false, false, 'all'],
];

test('matrix covers exactly the documented permissions', () => {
  expect(Object.keys(PERMISSIONS).sort()).toEqual(MATRIX.map((r) => r[0]).sort());
});

test.each(MATRIX)('%s → ADMIN %s, SALES %s, CEO %s', (permission, admin, sales, ceo) => {
  expect(scopeFor('ADMIN', permission)).toBe(admin);
  expect(scopeFor('SALES', permission)).toBe(sales);
  expect(scopeFor('CEO', permission)).toBe(ceo);
});

test('own scope depends on the resource owner', () => {
  const sales = { id: 'u1', role: 'SALES' as const };
  expect(can(sales, 'projects.write', { ownerId: 'u1' })).toBe(true);
  expect(can(sales, 'projects.write', { ownerId: 'u2' })).toBe(false);
  expect(can(sales, 'projects.write')).toBe(true); // may write some resources (their own)
});

test('D-018/D-021 the CEO edits any project, records and reverses payments, and owns company settings', () => {
  const ceo = { id: 'c1', role: 'CEO' as const };
  expect(can(ceo, 'projects.write', { ownerId: 'someone-else' })).toBe(true);
  expect(can(ceo, 'payments.create', { ownerId: 'someone-else' })).toBe(true);
  expect(can(ceo, 'payments.reverse')).toBe(true); // D-021
  expect(can(ceo, 'settings.manage')).toBe(true); // D-021
});

test('D-018 Admin adds anyone; the CEO adds and manages Project Managers only; PMs add no one', () => {
  expect(manageableRoles('ADMIN')).toEqual(['ADMIN', 'CEO', 'SALES']);
  expect(manageableRoles('CEO')).toEqual(['SALES']);
  expect(manageableRoles('SALES')).toEqual([]);
});

test('D-021 the Admin sees no client, project or money data at all', () => {
  const admin = { id: 'a1', role: 'ADMIN' as const };
  for (const p of ['projects.read', 'clients.read', 'invoices.read', 'billing.read', 'audit.business'] as const) {
    expect(can(admin, p)).toBe(false);
  }
  expect(can(admin, 'users.manage')).toBe(true);
  expect(can(admin, 'admin.overview')).toBe(true);
});
