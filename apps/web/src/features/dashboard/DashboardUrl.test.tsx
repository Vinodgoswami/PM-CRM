import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { dashboardCsv } from './csv';
import { dashboard } from './fixture';

const routes = { 'GET /dashboard': { body: dashboard() }, 'GET /owners': { body: { items: [{ id: 'u2', name: 'Rohan Mehta' }] } } };

test('the period and salesperson come from the address, so a view can be bookmarked', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/?period=THIS_QUARTER&ownerId=u2', sessionFor('CEO'));
  expect(await screen.findByRole('radio', { name: 'Quarter' })).toHaveAttribute('aria-checked', 'true');
  await waitFor(() => {
    const q = api.calls.filter((c) => c.path === '/dashboard').at(-1)!.url.searchParams;
    expect([q.get('period'), q.get('ownerId')]).toEqual(['THIS_QUARTER', 'u2']);
  });
});

test('changing the period writes it to the address', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  const { router } = renderApp('/', sessionFor('CEO'));
  await userEvent.click(await screen.findByRole('radio', { name: 'Month' }));
  expect(router.state.location.search).toBe('?period=THIS_MONTH');
});

test('number cards carry a 12-month trend line', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/', sessionFor('CEO'));
  const kpis = await screen.findByRole('region', { name: 'Key figures' });
  expect(within(kpis).getByRole('img', { name: 'Contracted, last 12 months' })).toBeInTheDocument();
});

test('Export CSV downloads the dashboard data', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  const created: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    created.push(b as Blob);
    return 'blob:x';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  renderApp('/', sessionFor('CEO'));
  await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
  expect(created).toHaveLength(1);
  expect(await created[0]!.text()).toContain('Key figures');
});

test('the CSV has amounts in major units with currency, and neutralises formulas', () => {
  const csv = dashboardCsv(
    dashboard({ clientRevenue: [{ id: 'c1', name: '=HYPERLINK("x")', bookedMinor: 150050, collectedMinor: -2500 }] }),
  );
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('Contracted,25000000.00,INR');
  expect(csv).toContain(`"'=HYPERLINK(""x"")",1500.50,-25.00,INR`);
  expect(csv).toContain('Q1,1000000.00,800000.00,900000.00,700000.00,INR');
  expect(csv).toContain('Rohan Mehta,15000000.00,7000000.00');
});
