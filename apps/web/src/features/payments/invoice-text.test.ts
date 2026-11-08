import { expect, test } from 'vitest';
import { parseInvoiceText } from './invoice-text';

// D-040: fields read from an invoice PDF's text. Anything not found is left out, so the field stays as typed.
test('a typical USD invoice', () => {
  const text = `ACME Software LLC
  Invoice Number: INV-2026-0147
  Invoice Date: 03/11/2026
  Description  Qty  Rate  Amount
  Design sprint 1 $3,000.00 $3,000.00
  Subtotal $4,000.00
  Tax $400.00
  Total Due: $4,400.00`;
  expect(parseInvoiceText(text, 'USD')).toEqual({ invoiceId: 'INV-2026-0147', amountMinor: 440000, date: '2026-11-03' });
});

test('an Indian invoice with lakh grouping and a written date', () => {
  const text =
    'TAX INVOICE\nInvoice No. CS/24-25/118\nDate: 5 Oct 2026\nGrand Total ₹ 1,18,000.00\nAmount in words: One lakh eighteen thousand';
  expect(parseInvoiceText(text, 'INR')).toEqual({ invoiceId: 'CS/24-25/118', amountMinor: 11800000, date: '2026-10-05' });
});

test('an ISO date and an amount with the currency code', () => {
  const text = 'Invoice # 9931\nIssued 2026-09-28\nAmount due USD 12,500';
  expect(parseInvoiceText(text, 'USD')).toEqual({ invoiceId: '9931', amountMinor: 1250000, date: '2026-09-28' });
});

test('a month-first US date is read correctly when the day is over 12', () => {
  expect(parseInvoiceText('Invoice Date: 10/28/2026\nTotal: $50.00', 'USD')).toMatchObject({ date: '2026-10-28', amountMinor: 5000 });
});

test('nothing recognisable gives nothing', () => {
  expect(parseInvoiceText('Thank you for your business!', 'USD')).toEqual({});
});

test('the due date is read from its own label, apart from the invoice date', () => {
  const text = 'Invoice No: INV-5\nInvoice Date: 01/11/2026\nDue Date: 15/11/2026\nTotal: ₹500.00';
  expect(parseInvoiceText(text, 'INR')).toEqual({ invoiceId: 'INV-5', amountMinor: 50000, date: '2026-11-01', dueDate: '2026-11-15' });
});

// D-046: date layouts real PDFs produce that were missed.
test('a date that pdf.js split into pieces ("05 / 11 / 2026") is still read', () => {
  expect(parseInvoiceText('Invoice Date : 05 / 11 / 2026\nTotal: ₹10.00', 'INR').date).toBe('2026-11-05');
});

test('dates under a table header row are matched to their columns', () => {
  const text = 'Invoice No   Invoice Date   Due Date   Amount\nINV-9   05/11/2026   20/11/2026   $500.00';
  expect(parseInvoiceText(text, 'USD')).toMatchObject({ date: '2026-11-05', dueDate: '2026-11-20' });
});

test('two-digit years and year-first slashes', () => {
  expect(parseInvoiceText('Date: 05/11/26', 'INR').date).toBe('2026-11-05');
  expect(parseInvoiceText('Invoice Date: 05-Nov-26', 'INR').date).toBe('2026-11-05');
  expect(parseInvoiceText('Invoice Date: 2026/11/05', 'INR').date).toBe('2026-11-05');
});

test('without a label the earliest date on the page wins, whatever its format', () => {
  expect(parseInvoiceText('ACME\n05/11/2026\nShip by 2026-12-01', 'INR').date).toBe('2026-11-05');
});

test('a day-first reading in the future falls back to month-first', () => {
  // 10/12/2026 is 10 Dec (future on 8 Nov) day-first, so it is read as 12 Oct.
  expect(parseInvoiceText('Invoice Date: 10/12/2026', 'USD', '2026-11-08').date).toBe('2026-10-12');
  expect(parseInvoiceText('Invoice Date: 10/12/2026', 'USD', '2026-12-31').date).toBe('2026-12-10');
});

test('"Updated" is not a date label', () => {
  expect(parseInvoiceText('Terms updated 01/01/2020\nInvoice Date: 05/11/2026', 'INR').date).toBe('2026-11-05');
});
