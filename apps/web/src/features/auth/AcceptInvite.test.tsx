import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, stubApi } from '../../test/render';

const preview = { email: 'vikram@x.test', name: 'Vikram Shah', role: 'CEO', companyName: 'ChicMic Studios' };

test('the invite page says who is invited, as what, and asks only to choose a password', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /auth/invite/tok123': { body: preview } }).fn);
  renderApp('/invite/tok123', null);
  expect(await screen.findByText('You’re invited to ChicMic Studios as CEO.')).toBeInTheDocument();
  expect(screen.getByText('vikram@x.test')).toBeInTheDocument();
  expect(screen.getByLabelText('Your name')).toHaveValue('Vikram Shah');
  expect(screen.getByLabelText('Choose a password')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Welcome!' })).toBeInTheDocument();
  expect(screen.queryByText('Welcome back!')).toBeNull();
});

test('an expired or used invite link says so instead of showing a form', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({ 'GET /auth/invite/old': { status: 400, body: { error: { code: 'VALIDATION_FAILED', message: 'invalid' } } } }).fn,
  );
  renderApp('/invite/old', null);
  expect(await screen.findByText(/This invite link has expired or was already used/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Choose a password')).toBeNull();
});

test('accepting signs the new user in', async () => {
  const api = stubApi({
    'GET /auth/invite/tok123': { body: preview },
    'POST /auth/invite/accept': {
      body: { user: { id: 'u9', name: 'Vikram Shah', email: 'vikram@x.test', role: 'CEO', avatarUrl: null }, csrfToken: 'c' },
    },
    'GET /dashboard': { status: 500, body: { error: { code: 'X', message: 'x' } } },
    'GET /owners': { body: { items: [] } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/invite/tok123', null);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Choose a password'), 'a-long-new-password');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.path === '/auth/invite/accept')?.body).toEqual({
      token: 'tok123',
      name: 'Vikram Shah',
      password: 'a-long-new-password',
    }),
  );
});
