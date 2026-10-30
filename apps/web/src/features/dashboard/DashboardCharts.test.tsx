import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { dashboard } from './fixture';

const open = async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /dashboard': { body: dashboard() }, 'GET /owners': { body: { items: [] } } }).fn);
  renderApp('/', sessionFor('CEO'));
  return screen.findByRole('region', { name: 'Quarter comparison' });
};

test('K10 average days to pay and K12 average deal have their own tiles', async () => {
  await open();
  const kpis = screen.getByRole('region', { name: 'Key figures' });
  expect(within(kpis).getByText('Avg days to pay').nextElementSibling).toHaveTextContent('4.5 days');
  expect(within(kpis).getByText('Avg deal').nextElementSibling).toHaveTextContent('₹18,75,000.00');
});

test('C2 quarter comparison labels each quarter with this year and last year', async () => {
  const q = await open();
  expect(within(q).getByRole('img', { name: /Q1: contracted ₹10,00,000.00, last year ₹9,00,000.00/ })).toBeInTheDocument();
});

test('C3 year over year states this year to date against last year at the same point', async () => {
  await open();
  const yoy = screen.getByRole('region', { name: 'Year over year' });
  expect(
    within(yoy).getByRole('img', { name: /Collected so far ₹70,00,000.00 vs ₹63,00,000.00 at the same point last year/ }),
  ).toBeInTheDocument();
});

test('C6 revenue by client lists the top clients and Others', async () => {
  await open();
  const c6 = screen.getByRole('region', { name: 'Revenue by client' });
  expect(within(c6).getByText('Acme')).toBeInTheDocument();
  expect(within(c6).getByText('Others (3)')).toBeInTheDocument();
});

test('C7 new vs upsell splits booked', async () => {
  await open();
  const c7 = screen.getByRole('region', { name: 'New vs extra work' });
  expect(c7).toHaveTextContent('New90%');
  expect(c7).toHaveTextContent('Upsell10%');
});

test('C8 pipeline shows count and value per stage', async () => {
  await open();
  const c8 = screen.getByRole('region', { name: 'Projects by stage' });
  expect(within(c8).getByText('Quoted').closest('li')).toHaveTextContent('4 · ₹50,00,000.00');
});

test('T2 overdue table lists days overdue and the salesperson', async () => {
  await open();
  const t2 = screen.getByRole('region', { name: 'Overdue milestones' });
  const row = within(t2).getByText('M1 Kickoff').closest('tr')!;
  expect(row).toHaveTextContent('10 days');
  expect(row).toHaveTextContent('Rohan Mehta');
});

test('team table shows win rate, avg deal, and a monthly trend per person', async () => {
  await open();
  const team = screen.getByRole('region', { name: 'Team performance' });
  expect(within(team).getByRole('columnheader', { name: 'Confirmation rate' })).toBeInTheDocument();
  expect(within(team).getByText('80%')).toBeInTheDocument();
  await userEvent.click(within(team).getByRole('button', { name: 'Show monthly trend for Rohan Mehta' }));
  expect(within(team).getByRole('img', { name: /Rohan Mehta, last 12 months/ })).toBeInTheDocument();
});

test('upcoming bookings show projects not yet confirmed with stage, project manager, start and amount', async () => {
  await open();
  const panel = screen.getByRole('region', { name: 'Upcoming bookings' });
  const row = within(panel)
    .getByText(/Loyalty App/)
    .closest('tr')!;
  for (const text of ['Zenith Pharma', 'Quoted', 'Rohan Mehta', '1 Dec 2026', '₹9,00,000.00']) expect(row).toHaveTextContent(text);
  expect(panel).toHaveTextContent('1 project · ₹9,00,000.00');
});
