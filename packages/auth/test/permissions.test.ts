import { expect, test } from 'vitest';
import { can, type Permission, PERMISSIONS, type Scope, scopeFor } from '../src/permissions';

// Row by row from docs/07-roles-and-permissions.md § Permission matrix: [ADMIN, SALES, CEO].
const MATRIX: [Permission, Scope, Scope, Scope][] = [
  ['dashboard.company', 'all', false, 'all'],
  ['dashboard.own', 'all', 'all', 'all'],
  ['invoices.read', 'all', 'own', 'all'],
  ['billing.read', 'all', 'own', 'all'],
  ['export', 'all', 'own', 'all'],
  ['projects.read', 'all', 'all', 'all'],
  ['clients.read', 'all', 'all', 'all'],
  ['projects.write', 'all', 'own', false],
  ['clients.write', 'all', 'all', false],
  ['payments.create', 'all', 'own', false],
  ['payments.editMeta', 'all', 'own', false],
  ['payments.reverse', 'all', false, false],
  ['projects.reassign', 'all', false, false],
  ['users.manage', 'all', false, false],
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

test('CEO never writes', () => {
  const ceo = { id: 'c1', role: 'CEO' as const };
  expect(can(ceo, 'payments.create')).toBe(false);
  expect(can(ceo, 'projects.write', { ownerId: 'c1' })).toBe(false);
  expect(can(ceo, 'dashboard.company')).toBe(true);
});
