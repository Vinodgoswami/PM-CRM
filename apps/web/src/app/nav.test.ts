import { expect, test } from 'vitest';
import { visibleNav } from './nav';

const labels = (role: 'ADMIN' | 'SALES' | 'CEO') => visibleNav({ id: 'u1', role }).map((i) => i.label);

// docs/08-screens-and-flows.md § Navigation by role.
test('ADMIN sees every section', () => {
  expect(labels('ADMIN')).toEqual(['Dashboard', 'Upcoming Invoices', 'Projects', 'Completed Billing', 'Clients', 'Settings', 'Audit log']);
});

test('SALES sees no settings or audit log', () => {
  expect(labels('SALES')).toEqual(['Dashboard', 'Upcoming Invoices', 'Projects', 'Completed Billing', 'Clients']);
});

test('CEO sees Settings (to manage Project Managers, D-018) and the audit log', () => {
  expect(labels('CEO')).toEqual(['Dashboard', 'Upcoming Invoices', 'Projects', 'Completed Billing', 'Clients', 'Settings', 'Audit log']);
});
