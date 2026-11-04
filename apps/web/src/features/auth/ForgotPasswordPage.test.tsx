import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, stubApi } from '../../test/render';

// D-034: self-service reset instead of "ask your admin".
const MESSAGE = 'If that email has an account, a reset link is on its way. It works once and expires in 24 hours.';

test('the sign-in page links to Forgot password', async () => {
  vi.stubGlobal('fetch', stubApi({}).fn);
  const { router } = renderApp('/login', null);
  await userEvent.click(await screen.findByRole('link', { name: 'Forgot password?' }));
  expect(router.state.location.pathname).toBe('/forgot-password');
  expect(screen.queryByText(/Ask your admin for a reset link/)).toBeNull();
});

test('asking for a reset link sends the email and shows the same answer for any address', async () => {
  const api = stubApi({ 'POST /auth/password/forgot': { body: { message: MESSAGE } } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/forgot-password', null);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), 'pm@chicmic.test');
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByRole('status')).toHaveTextContent(MESSAGE);
  expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({ email: 'pm@chicmic.test' });
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
});

test('an invalid email is caught before anything is sent', async () => {
  const api = stubApi({});
  vi.stubGlobal('fetch', api.fn);
  renderApp('/forgot-password', null);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), 'nope');
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
  await waitFor(() => expect(screen.getByText('Enter a valid email address')).toBeInTheDocument());
  expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
});
