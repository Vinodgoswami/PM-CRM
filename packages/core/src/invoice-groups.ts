import { type IsoDate } from './period';

export type InvoiceGroup = 'OVERDUE' | 'THIS_WEEK' | 'THIS_MONTH' | 'NEXT_MONTH' | 'LATER' | 'UNSCHEDULED';
export const INVOICE_GROUP_ORDER: InvoiceGroup[] = ['OVERDUE', 'THIS_WEEK', 'THIS_MONTH', 'NEXT_MONTH', 'LATER', 'UNSCHEDULED'];

const parts = (d: IsoDate) => d.split('-').map(Number) as [number, number, number];
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/**
 * Upcoming Invoices sections (docs/08 S2). "This week" is the next 7 days including today and wins over the month
 * buckets when it crosses a month end.
 */
export function invoiceGroup(dueDate: IsoDate | null, today: IsoDate): InvoiceGroup {
  if (!dueDate) return 'UNSCHEDULED';
  if (dueDate < today) return 'OVERDUE';
  const [y, m, d] = parts(today);
  if (dueDate <= iso(y, m, d + 6)) return 'THIS_WEEK';
  if (dueDate <= iso(y, m + 1, 0)) return 'THIS_MONTH';
  if (dueDate <= iso(y, m + 2, 0)) return 'NEXT_MONTH';
  return 'LATER';
}
