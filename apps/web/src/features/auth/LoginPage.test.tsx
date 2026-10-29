import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubFetch } from '../../test/render';

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

test('empty form shows field errors without calling the API', async () => {
  const fetch = stubFetch(200, {});
  vi.stubGlobal('fetch', fetch.fn);
  renderApp('/login', null);
  await submit('', '');
  expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  expect(screen.getByText('Enter your password')).toBeInTheDocument();
  expect(fetch.calls).toHaveLength(0);
});

test('wrong credentials show the server message', async () => {
  vi.stubGlobal('fetch', stubFetch(401, { error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' } }).fn);
  renderApp('/login', null);
  await submit('a@example.com', 'wrong-password');
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
});

test('rate limiting shows the retry message', async () => {
  vi.stubGlobal('fetch', stubFetch(429, { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in 15 minutes.' } }).fn);
  renderApp('/login', null);
  await submit('a@example.com', 'wrong-password');
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 15 minutes.');
});

test('successful login goes to next', async () => {
  const fetch = stubFetch(200, sessionFor('SALES'));
  vi.stubGlobal('fetch', fetch.fn);
  const { router } = renderApp('/login?next=%2Fprojects', null);
  await submit('A@Example.com', 'correct-password');
  await waitFor(() => expect(router.state.location.pathname).toBe('/projects'));
  expect(fetch.calls[0]!.url).toBe('/api/v1/auth/login');
  expect(JSON.parse(String(fetch.calls[0]!.init!.body))).toEqual({ email: 'a@example.com', password: 'correct-password' });
});

test('next cannot redirect off-site', async () => {
  vi.stubGlobal('fetch', stubFetch(200, sessionFor('SALES')).fn);
  const { router } = renderApp('/login?next=https%3A%2F%2Fevil.test', null);
  await submit('a@example.com', 'correct-password');
  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
});
