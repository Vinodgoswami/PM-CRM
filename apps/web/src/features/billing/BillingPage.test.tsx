import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { choose, renderApp, sessionFor, stubApi } from '../../test/render';
import { periodRange } from '@salescrm/core';

const payment = (over: object) => ({
  id: 'pay1',
  milestoneId: 'm1',
  milestoneLabel: 'M1',
  invoiceId: 'INV-9',
  paymentDate: '2026-10-05',
  amountMinor: 5000000,
  reversesPaymentId: null,
  reversedById: null,
  note: null,
  createdBy: { id: 'u1', name: 'Test User' },
  createdAt: '2026-10-05T10:00:00.000Z',
  canEdit: true,
  project: { id: 'p1', code: 'PRJ-0001', name: 'Website', currency: 'INR' },
  client: { id: 'c1', name: 'Acme' },
  ...over,
});
const settings = { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } };

test('period presets follow the April–March financial year', () => {
  expect(periodRange('THIS_FY', '2026-10-29', 4)).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  expect(periodRange('LAST_FY', '2026-10-29', 4)).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  expect(periodRange('THIS_QUARTER', '2026-10-29', 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  expect(periodRange('THIS_MONTH', '2026-02-10', 4)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  expect(periodRange('ALL', '2026-10-29', 4)).toEqual({});
});

test('payments list with total; reversals marked; filters reach the API', async () => {
  const api = stubApi({
    'GET /settings': settings,
    'GET /payments': {
      body: {
        items: [
          payment({ id: 'rev', amountMinor: -5000000, reversesPaymentId: 'pay1', note: 'Wrong invoice' }),
          payment({ reversedById: 'rev' }),
        ],
        page: 1,
        pageSize: 50,
        total: 2,
        totalMinor: 0,
        otherCurrencyPayments: 0,
      },
    },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/billing', sessionFor('CEO'));
  expect(await screen.findByText('-₹50,000.00')).toBeInTheDocument();
  expect(screen.getByText(/Reversal/)).toBeInTheDocument();
  expect(screen.getByText('₹0.00')).toBeInTheDocument();
  await choose(userEvent, screen.getByLabelText('Period'), 'LAST_FY');
  await waitFor(() => expect(api.calls.at(-1)!.url.searchParams.get('from')).toMatch(/^\d{4}-04-01$/));
  expect(screen.getByRole('link', { name: /export csv/i }).getAttribute('href')).toContain('/api/v1/exports/csv/billing?');
});

const owners = {
  body: {
    items: [
      { id: 'u1', name: 'Test User' },
      { id: 'u2', name: 'Rohan Mehta' },
    ],
  },
};
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
const page = (items: unknown[]) => ({
  body: { items, page: 1, pageSize: 50, total: items.length, totalMinor: 0, otherCurrencyPayments: 0 },
});

test('client, owner and a custom period reach the API and the CSV link', async () => {
  const api = stubApi({ 'GET /settings': settings, 'GET /owners': owners, 'GET /clients': clients, 'GET /payments': page([payment({})]) });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/billing', sessionFor('CEO'));
  const user = userEvent.setup();
  await screen.findByText('INV-9');
  await choose(user, screen.getByLabelText('Client'), 'c1');
  await choose(user, await screen.findByLabelText('Project manager'), 'u2');
  await choose(user, screen.getByLabelText('Period'), 'CUSTOM');
  await user.type(screen.getByLabelText('From'), '2026-05-01');
  await user.type(screen.getByLabelText('To'), '2026-06-30');
  await waitFor(() => {
    const q = api.calls.filter((c) => c.path === '/payments').at(-1)!.url.searchParams;
    expect([q.get('clientId'), q.get('ownerId'), q.get('from'), q.get('to')]).toEqual(['c1', 'u2', '2026-05-01', '2026-06-30']);
  });
  const href = screen.getByRole('link', { name: /export csv/i }).getAttribute('href')!;
  expect(href).toContain('clientId=c1');
  expect(href).toContain('ownerId=u2');
  expect(href).toContain('from=2026-05-01');
});

test('SALES get no salesperson filter; edit appears only where allowed', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /settings': settings,
      'GET /clients': clients,
      'GET /payments': page([
        payment({ id: 'a', invoiceId: 'INV-A', canEdit: true }),
        payment({ id: 'b', invoiceId: 'INV-B', canEdit: false }),
      ]),
    }).fn,
  );
  renderApp('/billing', sessionFor('SALES'));
  await screen.findByText('INV-A');
  expect(screen.queryByLabelText('Project manager')).toBeNull();
  expect(screen.getByRole('button', { name: 'Edit payment INV-A' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit payment INV-B' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Edit payment INV-A' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Edit payment details');
});
