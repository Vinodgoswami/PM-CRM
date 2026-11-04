import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { choose, renderApp, sessionFor, stubApi } from '../../test/render';

const settings = { companyName: 'Acme', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 };
const users = {
  items: [
    { id: 'u1', name: 'Test User', email: 'test@example.com', role: 'ADMIN', active: true, lastLoginAt: null },
    { id: 'u2', name: 'Rohan Mehta', email: 'rohan@example.com', role: 'SALES', active: true, lastLoginAt: null },
  ],
};

test('your own row in the users list has no role change, reset or deactivate; it points to your profile', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /settings': { body: settings }, 'GET /users': { body: users } }).fn);
  renderApp('/users', sessionFor('ADMIN'));
  const table = await screen.findByRole('table');
  const mine = (await within(table).findByText('Test User')).closest('tr')!;
  expect(within(mine).queryByRole('combobox')).toBeNull();
  expect(within(mine).queryByRole('button', { name: /reset link|deactivate/i })).toBeNull();
  expect(within(mine).getByRole('link', { name: 'Your profile' })).toHaveAttribute('href', '/profile');
  const theirs = within(table).getByText('Rohan Mehta').closest('tr')!;
  expect(within(theirs).getByRole('button', { name: /deactivate/i })).toHaveClass('text-danger');
});

test('the profile shows who you are and changes your password', async () => {
  const api = stubApi({ 'POST /auth/password/change': { status: 204 } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/profile', sessionFor('CEO'));
  const user = userEvent.setup();
  expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
  const card = screen.getByRole('heading', { name: 'Your profile' }).closest('section')!;
  expect(within(card).getByText('test@example.com')).toBeInTheDocument();
  expect(within(card).getByText('CEO')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Current password'), 'old-password-1');
  await user.type(screen.getByLabelText('New password'), 'brand-new-password');
  await user.type(screen.getByLabelText('Repeat new password'), 'brand-new-password');
  await user.click(screen.getByRole('button', { name: 'Change password' }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.path === '/auth/password/change')?.body).toEqual({
      currentPassword: 'old-password-1',
      newPassword: 'brand-new-password',
    }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Password changed. Other devices were signed out.');
});

test('the new password must be typed the same twice', async () => {
  const api = stubApi({});
  vi.stubGlobal('fetch', api.fn);
  renderApp('/profile', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Current password'), 'old-password-1');
  await user.type(screen.getByLabelText('New password'), 'brand-new-password');
  await user.type(screen.getByLabelText('Repeat new password'), 'something-else-123');
  await user.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('The two new passwords do not match.')).toBeInTheDocument();
  expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
});

test('the user menu links to the profile', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { status: 500, body: { error: { code: 'X', message: 'x' } } } }).fn);
  renderApp('/projects', sessionFor('SALES'));
  const user = userEvent.setup();
  vi.stubGlobal('fetch', stubApi({ 'GET /projects': { body: { items: [], page: 1, pageSize: 25, total: 0 } } }).fn);
  await user.click(await screen.findByRole('button', { name: /Test User/ }));
  expect(await screen.findByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
});

test('D-036 you choose the currency your own dashboard is shown in', async () => {
  const api = stubApi({
    'GET /settings': { body: { companyName: 'Acme', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
    'PATCH /me/preferences': { body: { displayCurrency: 'USD' } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/profile', sessionFor('SALES'));
  const user = userEvent.setup();
  const select = await screen.findByRole('combobox', { name: 'My dashboard currency' });
  await waitFor(() => expect(select).toHaveTextContent('Company currency (INR)'));
  await choose(user, select, 'USD');
  await waitFor(() => expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ displayCurrency: 'USD' }));
  await choose(user, select, '');
  await waitFor(() => expect(api.calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ displayCurrency: null }));
});
