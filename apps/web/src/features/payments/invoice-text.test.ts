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
