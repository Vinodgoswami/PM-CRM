import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from '../projects/fixtures';

// D-040: a dropped invoice PDF fills Invoice ID, Amount and Date; typing them by hand still works the same.
vi.mock('./readPdfText', () => ({
  readPdfText: vi.fn(async (file: File) =>
    file.name === 'scan.pdf' ? '' : 'Invoice Number: INV-77\nInvoice Date: 01/11/2026\nTotal Due: ₹40,000.00',
  ),
}));

const routes = {
  'GET /projects/p1': { body: detail() },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /settings': { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
  'GET /payments': { body: { items: [], page: 1, pageSize: 100, total: 0, totalMinor: 0, otherCurrencyPayments: 0 } },
};

async function openDialog() {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  return { user, dialog: await screen.findByRole('dialog') };
}

test('an invoice PDF fills the invoice ID, amount and date, and says so', async () => {
  const { user, dialog } = await openDialog();
  await user.upload(
    within(dialog).getByLabelText(/Invoice or payment slip/),
    new File(['%PDF'], 'INV-77.pdf', { type: 'application/pdf' }),
  );
  await waitFor(() => expect(within(dialog).getByLabelText('Invoice ID')).toHaveValue('INV-77'));
  expect(within(dialog).getByLabelText('Amount')).toHaveValue('40000.00');
  expect(within(dialog).getByLabelText('Payment date')).toHaveValue('2026-11-01');
  expect(within(dialog).getByRole('status')).toHaveTextContent(
    'Filled from INV-77.pdf: invoice ID, amount, date. Check them before saving.',
  );
});

test('a PDF without text (a scan) leaves the fields for typing', async () => {
  const { user, dialog } = await openDialog();
  await user.type(within(dialog).getByLabelText('Invoice ID'), 'TYPED-1');
  await user.upload(within(dialog).getByLabelText(/Invoice or payment slip/), new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' }));
  expect(await within(dialog).findByRole('status')).toHaveTextContent('No details could be read from scan.pdf');
  expect(within(dialog).getByLabelText('Invoice ID')).toHaveValue('TYPED-1');
});
