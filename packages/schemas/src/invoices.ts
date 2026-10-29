import { z } from 'zod';
import { isoDateSchema, minorSchema } from './projects';

export const INVOICE_GROUPS = ['OVERDUE', 'THIS_WEEK', 'THIS_MONTH', 'NEXT_MONTH', 'LATER', 'UNSCHEDULED'] as const;

export const invoicesQuerySchema = z.object({ clientId: z.string().optional(), ownerId: z.string().optional() });

const ref = z.object({ id: z.string(), name: z.string() });

export const invoiceItemSchema = z.object({
  milestoneId: z.string(),
  number: z.number(),
  title: z.string(),
  amountMinor: minorSchema,
  balanceMinor: minorSchema,
  dueDate: isoDateSchema.nullable(),
  daysFromToday: z.number().nullable(),
  status: z.enum(['PAID', 'OVERDUE', 'PARTIALLY_PAID', 'DUE_SOON', 'SCHEDULED', 'UNSCHEDULED']),
  currency: z.string(),
  canPay: z.boolean(),
  project: z.object({ id: z.string(), code: z.string(), name: z.string() }),
  client: ref,
  owner: ref,
});
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

export const invoicesResponseSchema = z.object({
  currency: z.string(),
  /** Items in another currency are listed but left out of the group totals (M-4). */
  otherCurrencyItems: z.number(),
  groups: z.array(z.object({ key: z.enum(INVOICE_GROUPS), totalMinor: minorSchema, count: z.number(), items: z.array(invoiceItemSchema) })),
});
export type InvoicesResponse = z.infer<typeof invoicesResponseSchema>;
