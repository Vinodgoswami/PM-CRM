import { expect, test } from 'vitest';
import { visibleNav } from './nav';

const labels = (role: 'ADMIN' | 'SALES' | 'CEO') => visibleNav({ id: 'u1', role }).map((i) => i.label);

// docs/08-screens-and-flows.md § Navigation by role.
test('ADMIN sees the dashboard (figures, no names), Users, Settings and the audit log (D-022)', () => {
  expect(labels('ADMIN')).toEqual(['Dashboard', 'Users', 'Settings', 'Audit log']);
});

test('SALES sees no settings or audit log', () => {
  expect(labels('SALES')).toEqual(['Dashboard', 'Upcoming Invoices', 'Projects', 'Completed Billing', 'Clients']);
});

test('CEO sees everything, with Users as a top-bar tab', () => {
  expect(labels('CEO')).toEqual([
    'Dashboard',
    'Upcoming Invoices',
    'Projects',
    'Completed Billing',
    'Clients',
    'Users',
    'Settings',
    'Audit log',
  ]);
});
