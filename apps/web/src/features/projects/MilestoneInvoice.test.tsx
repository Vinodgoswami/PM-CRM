import { todayIn } from '@salescrm/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

// D-041: an invoice PDF dropped on Add milestone fills task, amount and due date. D-043: for now it is only read, not
// stored. No payment is recorded: the milestone stays unpaid until someone marks it paid.
vi.mock('../payments/readPdfText', () => ({
  readPdfText: vi.fn(async () => 'Invoice Number: INV-88\nInvoice Date: 01/11/2026\nDue Date: 20/11/2026\nTotal Due: ₹20,000.00'),
}));

const routes = {
  'GET /projects/p1': { body: detail() },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /settings': { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
  'GET /payments': { body: { items: [], page: 1, pageSize: 100, total: 0, totalMinor: 0, otherCurrencyPayments: 0 } },
  'POST /projects/p1/milestones': { status: 201, body: detail() },
  'POST /projects/p1/documents/upload-url': { body: { documentId: 'd9', url: 'http://localhost/upload/d9', headers: {} } },
  'PUT /upload/d9': { body: {} },
  'POST /documents/d9/confirm': {
    body: {
      id: 'd9',
      name: 'INV-88.pdf',
      type: 'INVOICE',
      mimeType: 'application/pdf',
      sizeBytes: 4,
      paymentId: null,
      uploadedBy: { id: 'u1', name: 'Test User' },
      createdAt: '2026-11-05T10:00:00.000Z',
    },
  },
};

test('an invoice PDF fills the optional invoice ID (D-049), amount and due date; no PDF or payment is stored', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones&add=1', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('New milestone task'), 'Sprint 3');
  await user.upload(screen.getByLabelText(/Milestone invoice/), new File(['%PDF'], 'INV-88.pdf', { type: 'application/pdf' }));
  await waitFor(() => expect(screen.getByLabelText('New milestone invoice ID (optional)')).toHaveValue('INV-88'));
  expect(screen.getByLabelText('New milestone task')).toHaveValue('Sprint 3');
  expect(screen.getByLabelText('New milestone amount')).toHaveValue('20000.00');
  expect(screen.getByLabelText('New milestone due date')).toHaveValue('2026-11-20');
  expect(screen.getByRole('status')).toHaveTextContent('Filled from INV-88.pdf: invoice ID, amount, due date. Check them before adding.');

  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(api.calls.some((c) => c.path === '/projects/p1/milestones')).toBe(true));
  expect(api.calls.find((c) => c.path === '/projects/p1/milestones')?.body).toEqual({
    title: 'Sprint 3',
    invoiceId: 'INV-88',
    amountMinor: 2000000,
    dueDate: '2026-11-20',
  });
  expect(api.calls.some((c) => c.path.includes('/documents'))).toBe(false);
  expect(api.calls.some((c) => c.method === 'POST' && c.path.includes('/payments'))).toBe(false);
});

test('without a file the milestone is added by hand as before', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones&add=1', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('New milestone task'), 'Launch');
  await user.type(screen.getByLabelText('New milestone amount'), '500');
  await user.type(screen.getByLabelText('New milestone due date'), '2026-12-01');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(api.calls.some((c) => c.path === '/projects/p1/milestones')).toBe(true));
  expect(api.calls.find((c) => c.path === '/projects/p1/milestones')?.body).not.toHaveProperty('invoiceId');
  expect(api.calls.some((c) => c.path.includes('/documents'))).toBe(false);
});

test('the milestone list has its own Invoice ID column, and editing a row changes it', async () => {
  const withId = detail();
  withId.milestones[0] = { ...withId.milestones[0]!, invoiceId: 'CHS/2026-27/72' };
  const api = stubApi({ ...routes, 'GET /projects/p1': { body: withId } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  expect(await screen.findByRole('columnheader', { name: 'Invoice ID' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'CHS/2026-27/72' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Design' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Edit M1' }));
  const id = screen.getByLabelText('M1 invoice ID');
  await user.clear(id);
  await user.type(id, 'CHS/2026-27/96');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(api.calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ invoiceId: 'CHS/2026-27/96' }));
});

const withInvoiceId = () => {
  const d = detail();
  d.milestones[0] = { ...d.milestones[0]!, invoiceId: 'CHS/2026-27/72' };
  return d;
};
const paid = {
  id: 'pay9',
  milestoneId: 'm1',
  milestoneLabel: 'M1',
  invoiceId: 'CHS/2026-27/72',
  paymentDate: '2026-11-08',
  amountMinor: 5000000,
  reversesPaymentId: null,
  reversedById: null,
  note: null,
  createdBy: { id: 'u1', name: 'Test User' },
  createdAt: '2026-11-08T10:00:00.000Z',
  canEdit: true,
  project: { id: 'p1', code: 'PRJ-0001', name: 'Website Redesign', currency: 'INR' },
  client: { id: 'c1', name: 'Acme' },
};

test('D-054 with an invoice ID, Mark as paid asks only for the date, starting at the invoice (due) date', async () => {
  const api = stubApi({
    ...routes,
    'GET /projects/p1': { body: withInvoiceId() },
    'POST /milestones/m1/payments': { status: 201, body: paid },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  const dialog = await screen.findByRole('dialog', { name: 'Mark M1 as paid' });
  expect(within(dialog).getByText('CHS/2026-27/72')).toBeInTheDocument();
  const date = within(dialog).getByLabelText('Payment date');
  expect(date).toHaveValue('2026-10-01'); // M1's due date in the fixture
  await user.clear(date);
  await user.type(date, '2026-10-03');
  await user.click(within(dialog).getByRole('button', { name: 'Mark as paid' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  const post = api.calls.find((c) => c.method === 'POST')!;
  expect(post.body).toEqual({ milestoneLabel: 'M1', invoiceId: 'CHS/2026-27/72', paymentDate: '2026-10-03', amountMinor: 5000000 });
  expect(post.headers.get('Idempotency-Key')).toBeTruthy();
  expect(await screen.findByText(/M1 marked as paid/)).toBeInTheDocument();
});

test('D-054 a due date in the future starts the quick popup at today', async () => {
  const d = withInvoiceId();
  d.milestones[0] = { ...d.milestones[0]!, dueDate: '2999-01-01' };
  vi.stubGlobal('fetch', stubApi({ ...routes, 'GET /projects/p1': { body: d } }).fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  const dialog = await screen.findByRole('dialog', { name: 'Mark M1 as paid' });
  expect(within(dialog).getByLabelText('Payment date')).toHaveValue(todayIn('Asia/Kolkata', new Date()));
});

test('D-054 a refused quick payment, or More details, opens the full form with the chosen date', async () => {
  const api = stubApi({
    ...routes,
    'GET /projects/p1': { body: withInvoiceId() },
    'POST /milestones/m1/payments': {
      status: 400,
      body: { error: { code: 'VALIDATION_FAILED', message: 'No exchange rate is available. Enter the rate yourself.' } },
    },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  const quick = await screen.findByRole('dialog', { name: 'Mark M1 as paid' });
  await user.click(within(quick).getByRole('button', { name: 'Mark as paid' }));
  const dialog = await screen.findByRole('dialog', { name: 'Mark as paid' });
  expect(within(dialog).getByLabelText('Invoice ID')).toHaveValue('CHS/2026-27/72');
  expect(within(dialog).getByLabelText('Payment date')).toHaveValue('2026-10-01');
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the rate yourself');
});

test('D-054 More details opens the full form', async () => {
  vi.stubGlobal('fetch', stubApi({ ...routes, 'GET /projects/p1': { body: withInvoiceId() } }).fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  await user.click(within(await screen.findByRole('dialog', { name: 'Mark M1 as paid' })).getByRole('button', { name: 'More details' }));
  expect(await screen.findByRole('dialog', { name: 'Mark as paid' })).toBeInTheDocument();
});

test('without an invoice ID, Mark as paid opens the form as before', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});
