import { todayIn } from '@salescrm/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

const settings = { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } };
const payment = {
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
  project: { id: 'p1', code: 'PRJ-0001', name: 'Website Redesign', currency: 'INR' },
  client: { id: 'c1', name: 'Acme' },
};
const routes = {
  'GET /projects/p1': { body: detail() },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /settings': settings,
  'GET /payments': { body: { items: [payment], page: 1, pageSize: 100, total: 1, totalMinor: 5000000, otherCurrencyPayments: 0 } },
};

async function openMarkPaid() {
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Milestones' }));
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  return user;
}

test('the Mark-as-paid dialog is pre-filled with the label, today and the balance', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  await openMarkPaid();
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('Milestone')).toHaveValue('M1');
  expect(within(dialog).getByLabelText('Payment date')).toHaveValue(todayIn('Asia/Kolkata', new Date()));
  expect(within(dialog).getByLabelText('Amount')).toHaveValue('50000.00');
  expect(within(dialog).getByText("The amount can't be changed after saving.")).toBeInTheDocument();
});

test('saving sends one request with an Idempotency-Key, even on a double click', async () => {
  const api = stubApi({
    ...routes,
    'POST /milestones/m1/payments': { status: 201, body: { ...payment, id: 'pay2' } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = await openMarkPaid();
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Invoice ID'), 'INV-200');
  await user.dblClick(within(dialog).getByRole('button', { name: 'Save payment' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const posts = api.calls.filter((c) => c.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0]!.headers.get('Idempotency-Key')).toMatch(/.{8,}/);
  expect(posts[0]!.body).toMatchObject({ milestoneLabel: 'M1', invoiceId: 'INV-200', amountMinor: 5000000 });
});

test('a server rule violation is shown in the dialog', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({
      ...routes,
      'POST /milestones/m1/payments': {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The amount is more than what is left to pay on this milestone.',
            details: { rule: 'P-2' },
          },
        },
      },
    }).fn,
  );
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = await openMarkPaid();
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save payment' }));
  expect(await screen.findByText('The amount is more than what is left to pay on this milestone.')).toBeInTheDocument();
});

test('only an Admin can reverse, and a reason is required', async () => {
  const api = stubApi({
    ...routes,
    'POST /payments/pay1/reverse': { status: 201, body: { ...payment, id: 'rev', amountMinor: -5000000 } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Payments' }));
  await screen.findByText('INV-9');
  expect(screen.queryByRole('button', { name: /reverse/i })).toBeNull();
});

test('Admin reversal needs a reason', async () => {
  const api = stubApi({
    ...routes,
    'POST /payments/pay1/reverse': { status: 201, body: { ...payment, id: 'rev', amountMinor: -5000000 } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1', sessionFor('ADMIN'));
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Payments' }));
  await user.click(await screen.findByRole('button', { name: 'Reverse payment INV-9' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reverse payment' }));
  expect(await screen.findByText('Give a reason for the reversal')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Reason'), 'Wrong invoice');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reverse payment' }));
  await waitFor(() => expect(api.calls.some((c) => c.path === '/payments/pay1/reverse')).toBe(true));
  expect(api.calls.find((c) => c.path === '/payments/pay1/reverse')!.body).toEqual({ reason: 'Wrong invoice' });
});

test('without edit rights there is no Mark as paid and no Add milestone', async () => {
  vi.stubGlobal('fetch', stubApi({ ...routes, 'GET /projects/p1': { body: detail({ canEdit: false }) } }).fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Milestones' }));
  await screen.findByText('Design');
  expect(screen.queryByRole('button', { name: /mark .* as paid/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /add milestone/i })).toBeNull();
});

test('P-8 no Mark as paid on work that is not won yet', async () => {
  vi.stubGlobal('fetch', stubApi({ ...routes, 'GET /projects/p1': { body: detail({ status: 'PROPOSAL' }) } }).fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Milestones' }));
  await screen.findByText('Design');
  expect(screen.queryByRole('button', { name: /mark .* as paid/i })).toBeNull();
});
