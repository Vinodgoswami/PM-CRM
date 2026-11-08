import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

// D-063: monthly recurring milestones.
const withSeries = () => {
  const d = detail();
  d.recurring = [
    { id: 'r1', title: 'Support', amountMinor: 100000, startDate: '2026-04-15', count: 12, createdCount: 3, nextDate: '2026-07-15' },
  ];
  d.milestones[0] = { ...d.milestones[0]!, title: 'Support (1/12)', recurringSeriesId: 'r1' };
  return d;
};
const routes = {
  'GET /projects/p1': { body: withSeries() },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /settings': { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
  'GET /payments': { body: { items: [], page: 1, pageSize: 100, total: 0, totalMinor: 0, otherCurrencyPayments: 0 } },
  'POST /projects/p1/recurring': { status: 201, body: withSeries() },
  'POST /recurring/r1/extend': { status: 201, body: withSeries() },
  'POST /recurring/r1/stop': { status: 201, body: withSeries() },
};

test('Add milestone can repeat monthly: first invoice date and number of invoices', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones&add=1', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('checkbox', { name: 'Recurring monthly' }));
  expect(screen.queryByLabelText('New milestone due date')).toBeNull();
  await user.type(screen.getByLabelText('New milestone task'), 'Retainer');
  await user.type(screen.getByLabelText('Amount per invoice'), '1000');
  await user.type(screen.getByLabelText('First invoice date'), '2026-04-01');
  await user.clear(screen.getByLabelText('Number of invoices'));
  await user.type(screen.getByLabelText('Number of invoices'), '12');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(api.calls.some((c) => c.path === '/projects/p1/recurring')).toBe(true));
  expect(api.calls.find((c) => c.path === '/projects/p1/recurring')!.body).toEqual({
    title: 'Retainer',
    amountMinor: 100000,
    startDate: '2026-04-01',
    count: 12,
  });
});

test('the series is listed with its progress; it can be extended or stopped', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  const list = await screen.findByRole('region', { name: 'Recurring milestones' });
  expect(list).toHaveTextContent('Support');
  expect(list).toHaveTextContent('3 of 12 created');
  expect(list).toHaveTextContent('next 15 Jul 2026');
  expect(screen.getAllByText('Recurring').length).toBeGreaterThan(0); // badge on its milestone
  await user.click(within(list).getByRole('button', { name: 'Extend Support' }));
  await user.clear(within(list).getByLabelText('Months to add'));
  await user.type(within(list).getByLabelText('Months to add'), '6');
  await user.click(within(list).getByRole('button', { name: 'Add months' }));
  await waitFor(() => expect(api.calls.find((c) => c.path === '/recurring/r1/extend')?.body).toEqual({ months: 6 }));
  await user.click(within(list).getByRole('button', { name: 'Stop Support' }));
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stop' }));
  await waitFor(() => expect(api.calls.some((c) => c.path === '/recurring/r1/stop')).toBe(true));
});
