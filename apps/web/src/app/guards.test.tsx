import { screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../test/render';

test('signed-out visit to a protected page redirects to login with next', async () => {
  const { router } = renderApp('/projects', null);
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  expect(router.state.location.search).toBe('?next=%2Fprojects');
});

test('SALES opening settings sees the no-access page', async () => {
  renderApp('/settings', sessionFor('SALES'));
  expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
});

test('ADMIN can open settings', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /settings': { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
    }).fn,
  );
  renderApp('/settings', sessionFor('ADMIN'));
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
});

test('the sidebar shows the role-specific sections', async () => {
  renderApp('/', sessionFor('CEO'));
  const nav = await screen.findByRole('navigation', { name: 'Main' });
  expect(nav).toHaveTextContent('Audit log');
  expect(nav).not.toHaveTextContent('Settings');
});
