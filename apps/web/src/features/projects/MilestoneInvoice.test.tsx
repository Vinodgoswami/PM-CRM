import { screen, waitFor } from '@testing-library/react';
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

test('an invoice PDF fills amount and due date; D-048: no invoice ID at creation, no PDF or payment stored', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones&add=1', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('New milestone task'), 'Sprint 3');
  await user.upload(screen.getByLabelText(/Milestone invoice/), new File(['%PDF'], 'INV-88.pdf', { type: 'application/pdf' }));
  await waitFor(() => expect(screen.getByLabelText('New milestone amount')).toHaveValue('20000.00'));
  expect(screen.queryByLabelText('New milestone invoice ID')).toBeNull();
  expect(screen.getByLabelText('New milestone task')).toHaveValue('Sprint 3');
  expect(screen.getByLabelText('New milestone amount')).toHaveValue('20000.00');
  expect(screen.getByLabelText('New milestone due date')).toHaveValue('2026-11-20');
  expect(screen.getByRole('status')).toHaveTextContent('Filled from INV-88.pdf: amount, due date. Check them before adding.');

  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(api.calls.some((c) => c.path === '/projects/p1/milestones')).toBe(true));
  expect(api.calls.find((c) => c.path === '/projects/p1/milestones')?.body).toEqual({
    title: 'Sprint 3',
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

test("Mark as paid starts with the milestone's invoice ID", async () => {
  const withId = detail();
  withId.milestones[0] = { ...withId.milestones[0]!, invoiceId: 'CHS/2026-27/72' };
  vi.stubGlobal('fetch', stubApi({ ...routes, 'GET /projects/p1': { body: withId } }).fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  expect(await screen.findByLabelText('Invoice ID')).toHaveValue('CHS/2026-27/72');
});
