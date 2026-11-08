import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { dashboard } from './fixture';

const payment = {
  id: 'pay1',
  milestoneId: 'm1',
  milestoneLabel: 'M1',
  invoiceId: 'INV-77',
  paymentDate: '2026-10-05',
  amountMinor: 5000000,
  reversesPaymentId: null,
  reversedById: null,
  note: null,
  createdBy: { id: 'u1', name: 'Test User' },
  createdAt: '2026-10-05T10:00:00.000Z',
  canEdit: false,
  project: { id: 'p1', code: 'PRJ-0001', name: 'Website', currency: 'INR' },
  client: { id: 'c1', name: 'Acme' },
};
const invoiceItem = (day: string, title: string, balance: number) => ({
  milestoneId: `m-${day}-${title}`,
  number: 1,
  title,
  amountMinor: balance,
  balanceMinor: balance,
  dueDate: day,
  daysFromToday: 3,
  status: 'DUE_SOON',
  currency: 'INR',
  canPay: false,
  project: { id: 'p1', code: 'PRJ-0001', name: 'Website' },
  client: { id: 'c1', name: 'Acme' },
  owner: { id: 'u1', name: 'Test User' },
});
const routes = {
  'GET /dashboard': { body: dashboard() },
  'GET /owners': { body: { items: [] } },
  'GET /invoices': {
    body: {
      currency: 'INR',
      otherCurrencyItems: 0,
      groups: [
        {
          key: 'THIS_WEEK',
          totalMinor: 7500000,
          count: 2,
          items: [invoiceItem('2026-12-15', 'Design', 5000000), invoiceItem('2026-12-15', 'Build', 2500000)],
        },
      ],
    },
  },
  'GET /payments': { body: { items: [payment], page: 1, pageSize: 100, total: 1, totalMinor: 5000000, otherCurrencyPayments: 0 } },
  'GET /projects': {
    body: {
      items: [
        {
          id: 'p9',
          code: 'PRJ-0009',
          name: 'Loyalty App',
          status: 'WON',
          currency: 'INR',
          client: { id: 'c1', name: 'Acme' },
          owner: { id: 'u1', name: 'Test User' },
          wonAt: '2026-12-03',
          contractValueMinor: 35000000,
          collectedMinor: 0,
          outstandingMinor: 0,
          nextDueDate: null,
          hasOverdue: false,
          parentProjectId: null,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    },
  },
};

test('clicking a month bar shows the payments collected that month', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/', sessionFor('CEO'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /^Dec: / }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Collected in December 2026');
  expect(await within(dialog).findByText('INV-77')).toBeInTheDocument();
  const q = api.calls.filter((c) => c.path === '/payments').at(-1)!.url.searchParams;
  expect([q.get('from'), q.get('to')]).toEqual(['2026-12-01', '2026-12-31']);
});

test('on the Booked series the drill-down lists projects won that month', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/', sessionFor('CEO'));
  const user = userEvent.setup();
  await user.click(within(await screen.findByRole('radiogroup', { name: 'Series' })).getByRole('radio', { name: 'contracted' }));
  await user.click(await screen.findByRole('button', { name: /^Dec: / }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Confirmed in December 2026');
  expect(await within(dialog).findByText(/Loyalty App/)).toBeInTheDocument();
  const q = api.calls.filter((c) => c.path === '/projects').at(-1)!.url.searchParams;
  expect([q.get('wonFrom'), q.get('wonTo')]).toEqual(['2026-12-01', '2026-12-31']);
});

test('the due-date calendar shows each day’s balance and lists that day’s milestones', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/', sessionFor('CEO'));
  const user = userEvent.setup();
  const calendar = await screen.findByRole('region', { name: 'Due-date calendar' });
  while (!within(calendar).queryByText('December 2026')) {
    await user.click(within(calendar).getByRole('button', { name: 'Next month' }));
  }
  const day = within(calendar).getByRole('button', { name: /15 December 2026: ₹75,000.00 due/ });
  await user.click(day);
  expect(within(calendar).getByText('M1 Design')).toBeInTheDocument();
  expect(within(calendar).getByText('M1 Build')).toBeInTheDocument();
});

test('Export PDF opens the print dialog for the current view', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  renderApp('/', sessionFor('CEO'));
  await userEvent.click(await screen.findByRole('button', { name: 'Export PDF' }));
  expect(print).toHaveBeenCalledOnce();
  expect(screen.getByTestId('print-header')).toHaveTextContent(/Project Management CRM dashboard · Quarter/);
});

test('a drill-down with more than 100 payments offers Load more', async () => {
  const page = (n: number) => ({
    items: [{ ...payment, id: `pay-p${n}`, invoiceId: `INV-P${n}` }],
    page: n,
    pageSize: 100,
    total: 150,
    totalMinor: 5000000,
    otherCurrencyPayments: 0,
  });
  const api = stubApi({ ...routes, 'GET /payments': ({ url }) => ({ body: page(Number(url.searchParams.get('page') ?? 1)) }) });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/', sessionFor('CEO'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /^Dec: / }));
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('INV-P1')).toBeInTheDocument();
  expect(within(dialog).getByText('Showing 1 of 150')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Load more' }));
  expect(await within(dialog).findByText('INV-P2')).toBeInTheDocument();
  expect(within(dialog).getByText('INV-P1')).toBeInTheDocument();
});

test('D-029 calendar days still ahead are tinted green and days already past red', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/', sessionFor('CEO'));
  const user = userEvent.setup();
  const calendar = await screen.findByRole('region', { name: 'Due-date calendar' });
  while (!within(calendar).queryByText('December 2026')) {
    await user.click(within(calendar).getByRole('button', { name: 'Next month' }));
  }
  const day = within(calendar).getByRole('button', { name: /15 December 2026: / });
  const ahead = new Date() < new Date('2026-12-15T00:00:00');
  expect(day).toHaveAttribute('data-tone', ahead ? 'upcoming' : 'past');
});

test('D-057 the chart follows the period: a month shows weeks, and a week bar drills into its dates', async () => {
  const weeks = [
    { label: '1–7 Nov', from: '2026-11-01', to: '2026-11-07' },
    { label: '8–14 Nov', from: '2026-11-08', to: '2026-11-14' },
    { label: '15–21 Nov', from: '2026-11-15', to: '2026-11-21' },
    { label: '22–28 Nov', from: '2026-11-22', to: '2026-11-28' },
    { label: '29–30 Nov', from: '2026-11-29', to: '2026-11-30' },
  ].map((w, i) => ({ ...w, bookedMinor: 0, collectedMinor: (i + 1) * 100000, expectedMinor: 0 }));
  const api = stubApi({
    ...routes,
    'GET /dashboard': { body: dashboard({ period: { key: 'THIS_MONTH', from: '2026-11-01', to: '2026-11-30' }, periodSeries: weeks }) },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/', sessionFor('CEO'));
  const user = userEvent.setup();
  expect(await screen.findByText('This month, by week')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^(1–7|8–14|15–21|22–28|29–30) Nov: / })).toHaveLength(5);
  await user.click(screen.getByRole('button', { name: /^8–14 Nov: / }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Collected 8 Nov 2026 – 14 Nov 2026');
  const q = api.calls.filter((c) => c.path === '/payments').at(-1)!.url.searchParams;
  expect([q.get('from'), q.get('to')]).toEqual(['2026-11-08', '2026-11-14']);
});
