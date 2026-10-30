import { expect, test } from 'vitest';
import { can, manageableRoles, type Permission, PERMISSIONS, type Scope, scopeFor } from '../src/permissions';

// Row by row from docs/07-roles-and-permissions.md § Permission matrix: [ADMIN, SALES, CEO].
const MATRIX: [Permission, Scope, Scope, Scope][] = [
  ['dashboard.company', 'all', false, 'all'],
  ['dashboard.own', 'all', 'all', 'all'],
  ['invoices.read', 'all', 'own', 'all'],
  ['billing.read', 'all', 'own', 'all'],
  ['export', 'all', 'own', 'all'],
  ['projects.read', 'all', 'all', 'all'],
  ['clients.read', 'all', 'all', 'all'],
  ['projects.write', 'all', 'own', 'all'],
  ['clients.write', 'all', 'all', 'all'],
  ['payments.create', 'all', 'own', 'all'],
  ['payments.editMeta', 'all', 'own', 'all'],
  ['payments.reverse', 'all', false, false],
  ['projects.reassign', 'all', false, 'all'],
  ['users.manage', 'all', false, 'all'],
  ['settings.manage', 'all', false, false],
  ['audit.read', 'all', false, 'all'],
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

test('D-018 the CEO edits any project and records payments; only Admin reverses payments or changes settings', () => {
  const ceo = { id: 'c1', role: 'CEO' as const };
  expect(can(ceo, 'projects.write', { ownerId: 'someone-else' })).toBe(true);
  expect(can(ceo, 'payments.create', { ownerId: 'someone-else' })).toBe(true);
  expect(can(ceo, 'payments.reverse')).toBe(false);
  expect(can(ceo, 'settings.manage')).toBe(false);
});

test('D-018 Admin adds anyone; the CEO adds and manages Project Managers only; PMs add no one', () => {
  expect(manageableRoles('ADMIN')).toEqual(['ADMIN', 'CEO', 'SALES']);
  expect(manageableRoles('CEO')).toEqual(['SALES']);
  expect(manageableRoles('SALES')).toEqual([]);
});
