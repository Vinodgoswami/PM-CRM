import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

// D-058: tick several unpaid milestones and mark them paid together, each with its own paid date.
const twoUnpaid = () => {
  const d = detail();
  const base = d.milestones[0]!;
  d.milestones = [
    { ...base, id: 'm1', number: 1, title: 'Design', invoiceId: 'CHS/72', paidMinor: 0, balanceMinor: 5000000, dueDate: '2026-07-17' },
    { ...base, id: 'm2', number: 2, title: 'Build', invoiceId: null, paidMinor: 0, balanceMinor: 3000000, dueDate: '2026-08-14' },
    { ...base, id: 'm3', number: 3, title: 'Launch', invoiceId: null, paidMinor: 5000000, balanceMinor: 0, status: 'PAID' },
  ];
  return d;
};
const payment = (id: string, milestoneId: string) => ({
  id,
  milestoneId,
  milestoneLabel: 'M1',
  invoiceId: null,
  paymentDate: '2026-07-17',
  amountMinor: 1,
  reversesPaymentId: null,
  reversedById: null,
  note: null,
  createdBy: { id: 'u1', name: 'Test User' },
  createdAt: '2026-11-08T10:00:00.000Z',
  canEdit: true,
  project: { id: 'p1', code: 'PRJ-0001', name: 'Website Redesign', currency: 'INR' },
  client: { id: 'c1', name: 'Acme' },
});
const routes = {
  'GET /projects/p1': { body: twoUnpaid() },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /settings': { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
  'GET /payments': { body: { items: [], page: 1, pageSize: 100, total: 0, totalMinor: 0, otherCurrencyPayments: 0 } },
};

test('ticking unpaid milestones and saving pays each one on its own date', async () => {
  const api = stubApi({
    ...routes,
    'POST /milestones/m1/payments': { status: 201, body: payment('p1', 'm1') },
    'POST /milestones/m2/payments': { status: 201, body: payment('p2', 'm2') },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('checkbox', { name: 'Select M1' }));
  await user.click(screen.getByRole('checkbox', { name: 'Select M2' }));
  expect(screen.queryByRole('checkbox', { name: 'Select M3' })).toBeNull(); // already paid
  await user.click(screen.getByRole('button', { name: 'Mark 2 as paid' }));

  const dialog = await screen.findByRole('dialog', { name: 'Mark 2 milestones as paid' });
  expect(within(dialog).getByLabelText('M1 paid on')).toHaveValue('2026-07-17');
  expect(within(dialog).getByLabelText('M1 invoice ID')).toHaveValue('CHS/72');
  const m2 = within(dialog).getByLabelText('M2 paid on');
  expect(m2).toHaveValue('2026-08-14');
  await user.clear(m2);
  await user.type(m2, '2026-08-20');
  await user.type(within(dialog).getByLabelText('M2 invoice ID'), 'CHS/96');
  await user.click(within(dialog).getByRole('button', { name: 'Mark all as paid' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const posts = api.calls.filter((c) => c.method === 'POST');
  expect(posts.map((c) => [c.path, c.body])).toEqual([
    ['/milestones/m1/payments', { milestoneLabel: 'M1', invoiceId: 'CHS/72', paymentDate: '2026-07-17', amountMinor: 5000000 }],
    ['/milestones/m2/payments', { milestoneLabel: 'M2', invoiceId: 'CHS/96', paymentDate: '2026-08-20', amountMinor: 3000000 }],
  ]);
  expect(new Set(posts.map((c) => c.headers.get('Idempotency-Key'))).size).toBe(2);
  expect(await screen.findByText('2 milestones marked as paid')).toBeInTheDocument();
});

test('a refused one stays in the popup with its reason; the others are paid', async () => {
  const api = stubApi({
    ...routes,
    'POST /milestones/m1/payments': { status: 201, body: payment('p1', 'm1') },
    'POST /milestones/m2/payments': {
      status: 400,
      body: { error: { code: 'VALIDATION_FAILED', message: 'No exchange rate is available. Enter the rate yourself.' } },
    },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('checkbox', { name: 'Select M1' }));
  await user.click(screen.getByRole('checkbox', { name: 'Select M2' }));
  await user.click(screen.getByRole('button', { name: 'Mark 2 as paid' }));
  const dialog = await screen.findByRole('dialog', { name: 'Mark 2 milestones as paid' });
  await user.click(within(dialog).getByRole('button', { name: 'Mark all as paid' }));
  expect(await within(dialog).findByText(/M2: No exchange rate is available/)).toBeInTheDocument();
  expect(within(dialog).queryByLabelText('M1 paid on')).toBeNull();
  expect(within(dialog).getByLabelText('M2 paid on')).toBeInTheDocument();
});
