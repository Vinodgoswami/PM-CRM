import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { choose, renderApp, sessionFor, stubApi } from '../test/render';

// D-018: Admin adds CEOs; the CEO adds Project Managers and works on clients and projects alongside them.
const users = {
  items: [
    { id: 'a1', name: 'Asha Admin', email: 'admin@x.test', role: 'ADMIN', active: true, lastLoginAt: null },
    { id: 'u2', name: 'Rohan Mehta', email: 'rohan@x.test', role: 'SALES', active: true, lastLoginAt: null },
  ],
};
const settings = { companyName: 'Acme', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 };

test('the CEO has company settings and the import in Settings, and Users as its own page (D-021, D-022)', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({ 'GET /users': { body: users }, 'GET /users/invites': { body: { items: [] } }, 'GET /settings': { body: settings } }).fn,
  );
  const { router } = renderApp('/settings', sessionFor('CEO'));
  expect(await screen.findByRole('tab', { name: 'Company' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Import data' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Users' })).toBeNull();
  await router.navigate('/users');
  expect(await screen.findByText('Rohan Mehta')).toBeInTheDocument();
});

test('the CEO can invite only Project Managers, and cannot change Admin accounts', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /users': { body: users }, 'GET /settings': { body: settings } }).fn);
  renderApp('/users', sessionFor('CEO'));
  const user = userEvent.setup();
  const adminRow = (await screen.findByText('Asha Admin')).closest('tr')!;
  expect(within(adminRow).queryByRole('button', { name: /reset link|deactivate/i })).toBeNull();
  expect(within(adminRow).queryByRole('combobox')).toBeNull();
  const pmRow = screen.getByText('Rohan Mehta').closest('tr')!;
  expect(within(pmRow).getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
  expect(within(pmRow).queryByRole('combobox')).toBeNull();

  await user.click(screen.getByRole('button', { name: /invite/i }));
  await user.click(within(await screen.findByRole('dialog')).getByLabelText('Role'));
  const options = within(await screen.findByRole('listbox')).getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['Project Manager']);
});

test('the Admin can invite a CEO', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /users': { body: users }, 'GET /settings': { body: settings } }).fn);
  renderApp('/users', sessionFor('ADMIN'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /invite/i }));
  await user.click(within(await screen.findByRole('dialog')).getByLabelText('Role'));
  const options = within(await screen.findByRole('listbox')).getAllByRole('option');
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
  expect(owner).toHaveTextContent('Choose a project manager');
  await user.type(screen.getByLabelText('Project name'), 'Portal');
  await user.type(screen.getByLabelText('Booking amount'), '50,000');
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  expect(await screen.findByText('Choose the project manager for this project.')).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  await choose(user, owner, 'u2');
  await waitFor(() => expect(owner).toHaveTextContent('Rohan Mehta'));
});
