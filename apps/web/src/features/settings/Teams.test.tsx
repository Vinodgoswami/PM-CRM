import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { choose, renderApp, sessionFor, stubApi } from '../../test/render';

// D-024: project managers report to a CEO; the Admin assigns them, a CEO sees only their team.
const users = {
  items: [
    { id: 'c1', name: 'Manish', email: 'manish@x.test', role: 'CEO', active: true, lastLoginAt: null, manager: null },
    { id: 'c2', name: 'Vikram', email: 'vikram@x.test', role: 'CEO', active: true, lastLoginAt: null, manager: null },
    {
      id: 'p1',
      name: 'Meera Iyer',
      email: 'meera@x.test',
      role: 'SALES',
      active: true,
      lastLoginAt: null,
      manager: { id: 'c1', name: 'Manish' },
    },
    { id: 'p2', name: 'Priya', email: 'priya@x.test', role: 'SALES', active: true, lastLoginAt: null, manager: null },
  ],
};
const base = { 'GET /users': { body: users }, 'GET /users/invites': { body: { items: [] } } };

test('the Admin sees who each project manager reports to and can change it', async () => {
  const api = stubApi({
    ...base,
    'PATCH /users/p2': ({ body }) => ({
      body: { ...users.items[3], manager: { id: (body as { managerId: string }).managerId, name: 'Vikram' } },
    }),
  });
  vi.stubGlobal('fetch', api.fn);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderApp('/users', sessionFor('ADMIN'));
  const user = userEvent.setup();
  expect(await screen.findByRole('columnheader', { name: 'Reports to' })).toBeInTheDocument();
  expect(screen.getByLabelText('Reports to for Meera Iyer')).toHaveTextContent('Manish');
  expect(screen.getByLabelText('Reports to for Priya')).toHaveTextContent('No one yet');
  expect(within(screen.getByText('manish@x.test').closest('tr')!).queryByLabelText(/Reports to for/)).toBeNull(); // CEOs report to no one
  await choose(user, screen.getByLabelText('Reports to for Priya'), 'c2');
  await waitFor(() => expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ managerId: 'c2' }));
});

test('when the Admin invites a project manager they choose the CEO they report to', async () => {
  const api = stubApi({
    ...base,
    'POST /users/invite': {
      status: 201,
      body: { url: 'http://localhost:5173/invite/x', expiresAt: '2026-11-02T10:00:00.000Z', emailed: false },
    },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/users', sessionFor('ADMIN'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /invite user/i }));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Name'), 'New PM');
  await user.type(within(dialog).getByLabelText('Email'), 'new@x.test');
  await choose(user, within(dialog).getByLabelText('Reports to'), 'c1');
  await user.click(within(dialog).getByRole('button', { name: /send invite|invite/i }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'New PM',
      email: 'new@x.test',
      role: 'SALES',
      managerId: 'c1',
    }),
  );
});

test('a CEO’s Users page has no Reports to column: everyone listed is already on their team', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({ 'GET /users': { body: { items: [users.items[2]] } }, 'GET /users/invites': { body: { items: [] } } }).fn,
  );
  renderApp('/users', sessionFor('CEO'));
  expect(await screen.findByText('Meera Iyer')).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Reports to' })).toBeNull();
});
