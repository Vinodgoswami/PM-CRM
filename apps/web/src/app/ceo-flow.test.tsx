import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../test/render';

// D-018: Admin adds CEOs; the CEO adds Project Managers and works on clients and projects alongside them.
const users = {
  items: [
    { id: 'a1', name: 'Asha Admin', email: 'admin@x.test', role: 'ADMIN', active: true, lastLoginAt: null },
    { id: 'u2', name: 'Rohan Mehta', email: 'rohan@x.test', role: 'SALES', active: true, lastLoginAt: null },
  ],
};
const settings = { companyName: 'Acme', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 };

test('the CEO manages users from Settings and also has company settings and the import (D-021)', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /users': { body: users }, 'GET /settings': { body: settings } }).fn);
  renderApp('/settings', sessionFor('CEO'));
  expect(await screen.findByRole('tab', { name: 'Company' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Import data' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: 'Users' }));
  expect(await screen.findByText('Rohan Mehta')).toBeInTheDocument();
});

test('the CEO can invite only Project Managers, and cannot change Admin accounts', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /users': { body: users }, 'GET /settings': { body: settings } }).fn);
  renderApp('/settings', sessionFor('CEO'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'Users' }));
  const adminRow = (await screen.findByText('Asha Admin')).closest('tr')!;
  expect(within(adminRow).queryByRole('button', { name: /reset link|deactivate/i })).toBeNull();
  expect(within(adminRow).queryByRole('combobox')).toBeNull();
  const pmRow = screen.getByText('Rohan Mehta').closest('tr')!;
  expect(within(pmRow).getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
  expect(within(pmRow).queryByRole('combobox')).toBeNull();

  await user.click(screen.getByRole('button', { name: /invite/i }));
  const options = within(await screen.findByRole('dialog')).getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['Project Manager']);
});

test('the Admin can invite a CEO', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /users': { body: users }, 'GET /settings': { body: settings } }).fn);
  renderApp('/settings', sessionFor('ADMIN'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'Users' }));
  await user.click(await screen.findByRole('button', { name: /invite/i }));
  const options = within(await screen.findByRole('dialog')).getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['Project Manager', 'CEO', 'Admin']);
});

test('the CEO creates a project and must choose its project manager', async () => {
  const api = stubApi({
    'GET /users': { body: users },
    'GET /clients': { body: { items: [{ id: 'c1', name: 'Acme', currency: 'INR' }], page: 1, pageSize: 50, total: 1 } },
    'GET /settings': { body: settings },
    'POST /projects': { status: 201, body: { id: 'p9' } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('CEO'));
  const user = userEvent.setup();
  const owner = await screen.findByLabelText('Project manager');
  expect(owner).toHaveValue('');
  await user.type(screen.getByLabelText('Project name'), 'Portal');
  await user.type(screen.getByLabelText('Expected amount'), '50,000');
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  expect(await screen.findByText('Choose the project manager for this project.')).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  await user.selectOptions(owner, 'u2');
  await waitFor(() => expect(owner).toHaveValue('u2'));
});
