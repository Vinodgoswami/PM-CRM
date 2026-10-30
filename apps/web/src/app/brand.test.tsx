import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { dashboard } from '../features/dashboard/fixture';
import { renderApp, sessionFor, stubApi, stubFetch } from '../test/render';

test('the product is called Project Management CRM, never SalesCRM', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard() } }).fn);
  renderApp('/', sessionFor('CEO'));
  expect(await screen.findByRole('link', { name: /Project Management CRM/ })).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/SalesCRM|Sales CRM/);
});

test('the login welcome panel starts with Welcome back, with no product name', async () => {
  vi.stubGlobal('fetch', stubFetch(200, {}).fn);
  renderApp('/login', null);
  const welcome = await screen.findByRole('heading', { name: 'Welcome back!' });
  const panel = welcome.closest('[data-testid="welcome-panel"]')!;
  expect(panel).not.toHaveTextContent(/CRM/);
  expect(document.body).not.toHaveTextContent(/SalesCRM/);
});
