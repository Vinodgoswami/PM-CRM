import { z } from 'zod';
import { isoDateSchema, minorSchema, positiveMinorSchema } from './projects';

export const createPaymentSchema = z.object({
  milestoneLabel: z.string().trim().min(1).max(40).optional(),
  invoiceId: z.string().trim().max(80).optional(),
  paymentDate: isoDateSchema,
  amountMinor: positiveMinorSchema,
  note: z.string().trim().max(500).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** P-4: everything except the amount (and the milestone it belongs to) can be corrected later. */
export const updatePaymentMetaSchema = z
  .object({
    milestoneLabel: z.string().trim().min(1).max(40).optional(),
    invoiceId: z.string().trim().max(80).nullable().optional(),
    paymentDate: isoDateSchema.optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export type UpdatePaymentMetaInput = z.infer<typeof updatePaymentMetaSchema>;

export const reversePaymentSchema = z.object({ reason: z.string().trim().min(1, 'Give a reason for the reversal').max(500) });

export const paymentDtoSchema = z.object({
  id: z.string(),
  milestoneId: z.string(),
  milestoneLabel: z.string(),
  invoiceId: z.string().nullable(),
  paymentDate: isoDateSchema,
  amountMinor: minorSchema,
  reversesPaymentId: z.string().nullable(),
  reversedById: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.string(),
  /** The viewer may correct label / invoice ID / date / note (P-4); never true for reversal rows. */
  canEdit: z.boolean(),
  project: z.object({ id: z.string(), code: z.string(), name: z.string(), currency: z.string() }),
  client: z.object({ id: z.string(), name: z.string() }),
});
export type PaymentDto = z.infer<typeof paymentDtoSchema>;

export const billingQuerySchema = z.object({
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  ownerId: z.string().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type BillingQuery = z.infer<typeof billingQuerySchema>;

export const billingPageSchema = z.object({
  items: z.array(paymentDtoSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  /** Base-currency payments only (M-4). */
  totalMinor: minorSchema,
  otherCurrencyPayments: z.number(),
});
export type BillingPage = z.infer<typeof billingPageSchema>;
