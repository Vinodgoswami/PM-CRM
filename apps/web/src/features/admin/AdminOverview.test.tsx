import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { visibleNav } from '../../app/nav';
import { renderApp, sessionFor, stubApi } from '../../test/render';

// D-021: the Admin manages accounts and sees counts only.
const overview = {
  users: { total: 6, active: 5, admins: 1, ceos: 1, projectManagers: 3 },
  clients: 12,
  projects: 30,
  payments: 84,
  documents: 9,
};
const settings = { companyName: 'ChicMic Studios', baseCurrency: 'USD', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 };

test('the Admin’s home shows how much is in the system, with no names or amounts', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /admin/overview': { body: overview } }).fn);
  renderApp('/', sessionFor('ADMIN'));
  const page = await screen.findByRole('region', { name: 'Overview' });
  await within(page).findByText('Project managers');
  const stats: [string, string][] = [
    ['Project managers', '3'],
    ['CEOs', '1'],
    ['Clients', '12'],
    ['Projects', '30'],
    ['Payments recorded', '84'],
  ];
  for (const [label, value] of stats) {
    expect(within(page).getByText(label).closest('div')).toHaveTextContent(value);
  }
  expect(within(page).getByRole('link', { name: /manage users/i })).toHaveAttribute('href', '/settings');
});

test('the Admin’s menu has no client, project or money pages', () => {
  const labels = visibleNav({ id: 'a', role: 'ADMIN' }).map((i) => i.label);
  expect(labels).toEqual(['Overview', 'Settings', 'Audit log']);
});

test('the Admin edits the company name; currency and financial year are shown as the CEO’s', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /settings': { body: settings }, 'GET /users': { body: { items: [] } } }).fn);
  renderApp('/settings', sessionFor('ADMIN'));
  expect(await screen.findByLabelText('Company name')).toBeEnabled();
  expect(screen.getByLabelText('Base currency')).toBeDisabled();
  expect(screen.getByLabelText('Financial year starts in')).toBeDisabled();
  expect(screen.getByText('Currency, financial year, time zone and due-soon days are set by the CEO.')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Import data' })).toBeNull();
});

test('the CEO has company settings and the import', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /settings': { body: settings }, 'GET /users': { body: { items: [] } } }).fn);
  renderApp('/settings', sessionFor('CEO'));
  expect(await screen.findByLabelText('Base currency')).toBeEnabled();
  expect(screen.getByRole('tab', { name: 'Import data' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: 'Users' }));
});
