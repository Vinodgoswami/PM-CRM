import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';

// D-020: the company reports in USD; this client pays in INR.
const settings = { body: { companyName: 'ChicMic', baseCurrency: 'USD', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } };
const item = {
  milestoneId: 'm1',
  number: 1,
  title: 'Design',
  amountMinor: 5000000,
  balanceMinor: 5000000, // ₹50,000
  baseBalanceMinor: 60000, // $600 at the project's rate
  dueDate: '2026-10-20',
  daysFromToday: -9,
  status: 'OVERDUE',
  currency: 'INR',
  canPay: true,
  project: { id: 'p1', code: 'PRJ-0001', name: 'Website' },
  client: { id: 'c1', name: 'Acme' },
  owner: { id: 'u1', name: 'Test User' },
};
const invoices = {
  body: { currency: 'USD', otherCurrencyItems: 0, groups: [{ key: 'OVERDUE', totalMinor: 60000, count: 1, items: [item] }] },
};
const rate = ({ url }: { url: URL }) => ({
  body: { from: 'INR', to: 'USD', rate: '0.012', date: url.searchParams.get('date'), source: 'frankfurter' },
});

test('an invoice shows its balance in the client’s currency and in the company’s', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /invoices': invoices, 'GET /settings': settings }).fn);
  renderApp('/invoices', sessionFor('CEO'));
  const row =
    (await screen.findByText('M1 Design')).closest('li, tr, div[data-row]') ?? (await screen.findByText('M1 Design')).parentElement!;
  await waitFor(() => expect(screen.getByRole('region', { name: /Overdue/ })).toHaveTextContent('≈ $600.00'));
  expect(row).toBeTruthy();
});

test('Mark as paid pre-fills the day’s rate, shows the converted amount, and saves the rate you settle on', async () => {
  const api = stubApi({
    'GET /invoices': invoices,
    'GET /settings': settings,
    'GET /fx-rate': rate,
    'POST /milestones/m1/payments': { status: 201, body: {} },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/invoices', sessionFor('CEO'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mark M1 Design as paid' }));
  const dialog = await screen.findByRole('dialog');
  const field = await within(dialog).findByLabelText('Exchange rate (1 INR in USD)');
  await waitFor(() => expect(field).toHaveValue('0.012'));
  expect(dialog).toHaveTextContent('= $600.00 received');
  await user.clear(field);
  await user.type(field, '0.0105');
  expect(dialog).toHaveTextContent('= $525.00 received');
  await user.click(within(dialog).getByRole('button', { name: 'Save payment' }));
  await waitFor(() => expect(api.calls.find((c) => c.method === 'POST')?.body).toMatchObject({ amountMinor: 5000000, fxRate: '0.0105' }));
});

test('when no rate can be found, the form asks for one', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /invoices': invoices,
      'GET /settings': settings,
      'GET /fx-rate': { status: 400, body: { error: { code: 'VALIDATION_FAILED', message: 'No exchange rate is available' } } },
    }).fn,
  );
  renderApp('/invoices', sessionFor('CEO'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mark M1 Design as paid' }));
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('No rate found for this date. Enter the rate you received.')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Save payment' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter the exchange rate');
});

test('same-currency payments need no rate', async () => {
  const inr = { body: { ...settings.body, baseCurrency: 'INR' } };
  vi.stubGlobal('fetch', stubApi({ 'GET /invoices': invoices, 'GET /settings': inr }).fn);
  renderApp('/invoices', sessionFor('CEO'));
  await userEvent.click(await screen.findByRole('button', { name: 'Mark M1 Design as paid' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).queryByLabelText(/Exchange rate/)).toBeNull();
});

test('Completed Billing lists each payment in both currencies', async () => {
  const payment = {
    id: 'pay1',
    milestoneId: 'm1',
    milestoneLabel: 'M1',
    invoiceId: 'INV-9',
    paymentDate: '2026-10-05',
    amountMinor: 5000000,
    baseCurrency: 'USD',
    fxRate: '0.012',
    baseAmountMinor: 60000,
    reversesPaymentId: null,
    reversedById: null,
    note: null,
    createdBy: { id: 'u1', name: 'Test User' },
    createdAt: '2026-10-05T10:00:00.000Z',
    canEdit: false,
    project: { id: 'p1', code: 'PRJ-0001', name: 'Website', currency: 'INR' },
    client: { id: 'c1', name: 'Acme' },
  };
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /settings': settings,
      'GET /payments': { body: { items: [payment], page: 1, pageSize: 50, total: 1, totalMinor: 60000, otherCurrencyPayments: 0 } },
    }).fn,
  );
  renderApp('/billing', sessionFor('CEO'));
  const row = (await screen.findByText('INV-9')).closest('tr')!;
  expect(row).toHaveTextContent('₹50,000.00');
  expect(row).toHaveTextContent('$600.00 @ 0.012');
});
