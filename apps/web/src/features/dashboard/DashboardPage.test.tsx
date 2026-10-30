import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { dashboard } from './fixture';

test('the dashboard greets the user and shows the headline numbers', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard() } }).fn);
  renderApp('/', sessionFor('CEO'));
  expect(await screen.findByRole('heading', { name: /Welcome back, Test/ })).toBeInTheDocument();
  const collected = await screen.findByRole('region', { name: 'Collected' });
  await waitFor(() => expect(within(collected).getByText('₹1,20,00,000.00')).toBeInTheDocument());
  expect(within(collected).getByText('+20%')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Outstanding' })).toHaveTextContent('7 overdue');
  expect(screen.getByText('75%')).toBeInTheDocument();
});

test('the CEO sees team performance; SALES do not', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard() } }).fn);
  renderApp('/', sessionFor('CEO'));
  expect(await screen.findByRole('region', { name: 'Team performance' })).toHaveTextContent('Rohan Mehta');
});

test('SALES see their own dashboard without the team table', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard({ team: null }) } }).fn);
  renderApp('/', sessionFor('SALES'));
  await screen.findByRole('heading', { name: /Welcome back/ });
  expect(screen.queryByRole('region', { name: 'Team performance' })).toBeNull();
});

test('the dashboard opens on this quarter; switching the period asks the API for that period', async () => {
  const api = stubApi({ 'GET /dashboard': { body: dashboard() } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/', sessionFor('ADMIN'));
  await screen.findByRole('heading', { name: /Welcome back/ });
  await waitFor(() =>
    expect(
      api.calls
        .filter((c) => c.path === '/dashboard')
        .at(-1)!
        .url.searchParams.get('period'),
    ).toBe('THIS_QUARTER'),
  );
  await userEvent.click(screen.getByRole('radio', { name: 'Year' }));
  await waitFor(() =>
    expect(
      api.calls
        .filter((c) => c.path === '/dashboard')
        .at(-1)!
        .url.searchParams.get('period'),
    ).toBe('THIS_FY'),
  );
});

test('other-currency projects are called out, not silently mixed in', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard({ otherCurrencyProjects: 2 }) } }).fn);
  renderApp('/', sessionFor('CEO'));
  expect(await screen.findByText(/2 projects in other currencies are not included/)).toBeInTheDocument();
});

test('K11 win rate shows in the headline card', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard() } }).fn);
  renderApp('/', sessionFor('CEO'));
  const collected = await screen.findByRole('region', { name: 'Collected' });
  expect(within(collected).getByText('Confirmation rate').nextElementSibling).toHaveTextContent('60%');
});

test('K11 win rate is a dash when nothing was won or lost', async () => {
  const base = dashboard();
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard({ kpis: { ...base.kpis, winRate: null } }) } }).fn);
  renderApp('/', sessionFor('CEO'));
  const collected = await screen.findByRole('region', { name: 'Collected' });
  expect(within(collected).getByText('Confirmation rate').nextElementSibling).toHaveTextContent('—');
});
