import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { choose, renderApp, sessionFor, stubApi } from '../../test/render';
import { dashboard } from './fixture';

const owners = {
  items: [
    { id: 'u2', name: 'Rohan Mehta' },
    { id: 'u3', name: 'Meera Iyer' },
    { id: 'u4', name: 'Priya Shah' },
  ],
};
const forOwner = ({ url }: { url: URL }) => {
  const rohan = url.searchParams.get('ownerId') === 'u2';
  const base = dashboard();
  return { body: dashboard({ kpis: { ...base.kpis, bookedMinor: rohan ? 5000000 : 3000000, winRate: rohan ? 0.5 : 0.75 } }) };
};

test('the CEO compares two project managers side by side for a period', async () => {
  const api = stubApi({ 'GET /owners': { body: owners }, 'GET /dashboard': forOwner });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/compare?a=u2&b=u3&period=FY_TO_DATE', sessionFor('CEO'));
  const table = await screen.findByRole('table', { name: 'Comparison' });
  expect(within(table).getByRole('columnheader', { name: 'Rohan Mehta' })).toBeInTheDocument();
  expect(within(table).getByRole('columnheader', { name: 'Meera Iyer' })).toBeInTheDocument();
  await waitFor(() => expect(within(table).getByText('Contracted').closest('tr')).toHaveTextContent('₹50,000.00₹30,000.00'));
  expect(within(table).getByText('Confirmation rate').closest('tr')).toHaveTextContent('50%75%');
  const asked = api.calls
    .filter((c) => c.path === '/dashboard')
    .map((c) => [c.url.searchParams.get('ownerId'), c.url.searchParams.get('period')]);
  expect(asked).toEqual(
    expect.arrayContaining([
      ['u2', 'FY_TO_DATE'],
      ['u3', 'FY_TO_DATE'],
    ]),
  );
  expect(screen.getByRole('img', { name: /Monthly collected: Rohan Mehta vs Meera Iyer/ })).toBeInTheDocument();
});

test('changing a person or the period updates the address', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /owners': { body: owners }, 'GET /dashboard': forOwner }).fn);
  const { router } = renderApp('/compare?a=u2&b=u3', sessionFor('CEO'));
  const user = userEvent.setup();
  const second = await screen.findByLabelText('Second project manager');
  await waitFor(() => expect(second).toHaveTextContent('Meera Iyer')); // people loaded
  await choose(user, second, 'u4');
  await user.click(screen.getByRole('radio', { name: 'Month' }));
  expect(new URLSearchParams(router.state.location.search).get('b')).toBe('u4');
  expect(new URLSearchParams(router.state.location.search).get('period')).toBe('THIS_MONTH');
});

test('the dashboard links to the comparison for the CEO but not for a project manager', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /owners': { body: owners },
      'GET /dashboard': { body: dashboard() },
      'GET /invoices': { body: { currency: 'INR', otherCurrencyItems: 0, groups: [] } },
    }).fn,
  );
  renderApp('/', sessionFor('CEO'));
  expect(await screen.findByRole('link', { name: /compare/i })).toHaveAttribute('href', '/compare');
});

test('a project manager cannot open the comparison', async () => {
  vi.stubGlobal('fetch', stubApi({}).fn);
  renderApp('/compare', sessionFor('SALES'));
  expect(await screen.findByText(/permission|not allowed|access/i)).toBeInTheDocument();
});

test('an unknown person in the address falls back to real project managers', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /owners': { body: owners }, 'GET /dashboard': forOwner }).fn);
  renderApp('/compare?a=nobody&b=ghost', sessionFor('CEO'));
  const table = await screen.findByRole('table', { name: 'Comparison' });
  await waitFor(() => expect(within(table).getByRole('columnheader', { name: 'Rohan Mehta' })).toBeInTheDocument());
  expect(within(table).getByRole('columnheader', { name: 'Meera Iyer' })).toBeInTheDocument();
});

test('projects in another currency are called out, as on the dashboard', async () => {
  const base = dashboard();
  vi.stubGlobal(
    'fetch',
    stubApi({ 'GET /owners': { body: owners }, 'GET /dashboard': { body: { ...base, otherCurrencyProjects: 4 } } }).fn,
  );
  renderApp('/compare', sessionFor('CEO'));
  expect(await screen.findByText(/4 projects in other currencies/i)).toBeInTheDocument();
});
