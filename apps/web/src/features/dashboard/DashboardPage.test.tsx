import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { dashboard } from './fixture';

test('the dashboard greets the user and shows the headline numbers', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard() } }).fn);
  renderApp('/', sessionFor('CEO'));
  expect(await screen.findByRole('heading', { name: /Welcome back, Test/ })).toBeInTheDocument();
  // D-069: the headline is everything contracted; received and due follow the period.
  const hero = await screen.findByRole('region', { name: 'Total contracted' });
  await waitFor(() => expect(within(hero).getByText('₹3,00,00,000.00')).toBeInTheDocument());
  expect(within(hero).getByText('Received').closest('div')).toHaveTextContent('₹1,20,00,000.00');
  expect(within(hero).getByText('Due').closest('div')).toHaveTextContent('₹40,00,000.00');
  expect(within(hero).getByText('Projects').closest('div')).toHaveTextContent('12');
  expect(hero).not.toHaveTextContent('Confirmation rate');
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
  renderApp('/', sessionFor('CEO'));
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
  expect(await screen.findByText(/2 projects in other currencies have no exchange rate yet/)).toBeInTheDocument();
});

// D-069: the confirmation rate left the headline card; the team table and Compare still show it.

test('D-028 the dashboard splits total booking into initial booking and upsell', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard() } }).fn);
  renderApp('/', sessionFor('CEO'));
  const split = await screen.findByRole('region', { name: 'Booking split' });
  expect(split).toHaveTextContent('Initial booking₹2,25,00,000.00');
  expect(split).toHaveTextContent('Upsell₹25,00,000.00');
  expect(split).toHaveTextContent('Total booking₹2,50,00,000.00');
});

test('D-036 a dashboard shown in your own currency says how it was converted', async () => {
  const converted = { ...dashboard(), currency: 'USD', conversion: { from: 'INR', to: 'USD', rate: '0.012', date: '2026-11-04' } };
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: converted } }).fn);
  renderApp('/', sessionFor('SALES'));
  expect(await screen.findByRole('note')).toHaveTextContent(
    'Shown in USD. Projects in USD use their own amounts; the rest are converted at each project’s rate from the day it was created. Change it in your profile.',
  );
});
