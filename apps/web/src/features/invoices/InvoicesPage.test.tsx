import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { choose, renderApp, sessionFor, stubApi } from '../../test/render';

const item = (over: object) => ({
  milestoneId: 'm1',
  number: 1,
  title: 'Design',
  amountMinor: 1000000,
  balanceMinor: 600000,
  dueDate: '2026-10-20',
  daysFromToday: -9,
  status: 'OVERDUE',
  currency: 'INR',
  canPay: true,
  project: { id: 'p1', code: 'PRJ-0001', name: 'Website' },
  client: { id: 'c1', name: 'Acme' },
  owner: { id: 'u1', name: 'Test User' },
  ...over,
});
const invoices = {
  body: {
    currency: 'INR',
    otherCurrencyItems: 0,
    groups: [
      { key: 'OVERDUE', totalMinor: 600000, count: 1, items: [item({})] },
      {
        key: 'THIS_WEEK',
        totalMinor: 250000,
        count: 1,
        items: [
          item({
            milestoneId: 'm2',
            number: 2,
            title: 'Build',
            balanceMinor: 250000,
            daysFromToday: 3,
            status: 'DUE_SOON',
            dueDate: '2026-11-01',
          }),
        ],
      },
    ],
  },
};
const settings = { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } };

test('sections render in order with counts and totals, overdue first', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /invoices': invoices, 'GET /settings': settings }).fn);
  renderApp('/invoices', sessionFor('CEO'));
  const overdue = await screen.findByRole('region', { name: /Overdue/ });
  expect(within(overdue).getAllByText('₹6,000.00')).toHaveLength(2); // section total and the single row's balance
  expect(within(overdue).getByText('9 days late')).toBeInTheDocument();
  const week = screen.getByRole('region', { name: /This week/ });
  expect(within(week).getByText('in 3 days')).toBeInTheDocument();
  const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
  expect(regions[0]).toMatch(/Overdue/);
});

test('Mark as paid opens the dialog from the invoice row', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /invoices': invoices, 'GET /settings': settings }).fn);
  renderApp('/invoices', sessionFor('SALES'));
  await userEvent.click(await screen.findByRole('button', { name: 'Mark M1 Design as paid' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Mark as paid');
});

test('the CEO sees invoices without Mark as paid', async () => {
  const ceoInvoices = {
    body: { ...invoices.body, groups: invoices.body.groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, canPay: false })) })) },
  };
  vi.stubGlobal('fetch', stubApi({ 'GET /invoices': ceoInvoices, 'GET /settings': settings }).fn);
  renderApp('/invoices', sessionFor('CEO'));
  await screen.findByRole('region', { name: /Overdue/ });
  expect(screen.queryByRole('button', { name: /as paid/ })).toBeNull();
});

test('client and salesperson filters reach the API; the salesperson list does not shrink', async () => {
  const clients = {
    body: {
      items: [
        {
          id: 'c1',
          name: 'Acme',
          company: null,
          primaryEmail: null,
          projects: 1,
          archived: false,
          currency: 'INR',
          bookedMinor: 0,
          collectedMinor: 0,
          outstandingMinor: 0,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    },
  };
  const api = stubApi({
    'GET /invoices': invoices,
    'GET /settings': settings,
    'GET /clients': clients,
    'GET /owners': {
      body: {
        items: [
          { id: 'u1', name: 'Test User' },
          { id: 'u2', name: 'Rohan Mehta' },
        ],
      },
    },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/invoices', sessionFor('CEO'));
  const user = userEvent.setup();
  await screen.findByRole('region', { name: /Overdue/ });
  await choose(user, screen.getByLabelText('Client'), 'c1');
  await choose(user, await screen.findByLabelText('Project manager'), 'u2');
  await waitFor(() => {
    const q = api.calls.filter((c) => c.path === '/invoices').at(-1)!.url.searchParams;
    expect([q.get('clientId'), q.get('ownerId')]).toEqual(['c1', 'u2']);
  });
  await user.click(screen.getByLabelText('Project manager'));
  expect(within(await screen.findByRole('listbox')).getAllByRole('option')).toHaveLength(3);
});
