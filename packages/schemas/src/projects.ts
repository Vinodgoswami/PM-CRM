import { z } from 'zod';
import { clientNameSchema } from './clients';
import { emailSchema } from './auth';

export const PROJECT_STATUSES = ['LEAD', 'PROPOSAL', 'WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'LOST'] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatusValue = z.infer<typeof projectStatusSchema>;

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-29');
/** Money in minor units, as a JSON integer (docs/10). */
export const minorSchema = z.number().int().refine(Number.isSafeInteger, 'Amount is too large');
export const positiveMinorSchema = minorSchema.refine((v) => v > 0, 'Enter an amount above zero');

const text = (max: number) => z.string().trim().max(max);

export const milestoneInputSchema = z.object({
  title: text(200).min(1, 'Enter the milestone task'),
  /** D-047: the invoice it is billed on. */
  invoiceId: text(80).optional(),
  description: text(2000).optional(),
  amountMinor: positiveMinorSchema,
  dueDate: isoDateSchema.optional(),
});
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

export const createProjectSchema = z
  .object({
    name: text(200).min(1, 'Enter the project name'),
    description: text(5000).default(''),
    clientId: z.string().min(1).optional(),
    newClient: z.object({ name: clientNameSchema, email: emailSchema.optional() }).optional(),
    ownerId: z.string().optional(),
    status: z.enum(['LEAD', 'PROPOSAL', 'WON', 'ACTIVE']).default('LEAD'),
    startDate: isoDateSchema.optional(),
    durationValue: z.number().int().min(1).max(600).optional(),
    durationUnit: z.enum(['WEEKS', 'MONTHS']).optional(),
    expectedAmountMinor: positiveMinorSchema,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    parentProjectId: z.string().optional(),
    /** D-037: for a phase, extra work (UPSELL, the default) or a part of the original scope (SCOPE). */
    phaseKind: z.enum(['UPSELL', 'SCOPE']).optional(),
    tags: z.array(text(40).min(1)).max(20).default([]),
    milestones: z.array(milestoneInputSchema).max(50).default([]),
    /** D-064: billed monthly: a recurring series named after the project is created with it. */
    recurring: z
      .object({
        amountMinor: positiveMinorSchema,
        startDate: isoDateSchema,
        count: z.number().int().min(1, 'At least one invoice').max(120, 'At most 120 invoices'),
      })
      .optional(),
  })
  .refine((v) => (v.clientId ? 1 : 0) + (v.newClient ? 1 : 0) === 1, {
    message: 'Choose an existing client or add a new one',
    path: ['clientId'],
  });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: text(200).min(1).optional(),
  description: text(5000).optional(),
  startDate: isoDateSchema.nullable().optional(),
  durationValue: z.number().int().min(1).max(600).nullable().optional(),
  durationUnit: z.enum(['WEEKS', 'MONTHS']).nullable().optional(),
  expectedAmountMinor: positiveMinorSchema.optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  tags: z.array(text(40).min(1)).max(20).optional(),
  phaseKind: z.enum(['UPSELL', 'SCOPE']).optional(),
  /** D-027: move the project to another client billed in the same currency. */
  clientId: z.string().min(1).optional(),
  /** Optimistic concurrency: the `updatedAt` the client last saw. */
  updatedAt: z.string().min(1),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const changeStatusSchema = z.object({ status: projectStatusSchema });
export const changeOwnerSchema = z.object({ ownerId: z.string().min(1) });

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

export const projectListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z
    .string()
    .transform((v) => v.split(',').filter(Boolean))
    .pipe(z.array(projectStatusSchema))
    .optional(),
  clientId: z.string().optional(),
  ownerId: z.string().optional(),
  wonFrom: isoDateSchema.optional(),
  wonTo: isoDateSchema.optional(),
  hasOverdue: bool,
  sort: z.enum(['code', 'name', 'wonAt', 'contractValue', 'outstanding', 'nextDue']).default('code'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

const ref = z.object({ id: z.string(), name: z.string() });

/** D-067: the viewer's currency and this project's rate into it (null when none is known: shown in its own currency). */
export const viewRateSchema = z.object({ currency: z.string(), rate: z.string().nullable() });

export const projectListItemSchema = z.object({
  view: viewRateSchema.nullable().default(null),
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: projectStatusSchema,
  currency: z.string(),
  client: ref,
  owner: ref,
  wonAt: isoDateSchema.nullable(),
  contractValueMinor: z.number(),
  collectedMinor: z.number(),
  outstandingMinor: z.number(),
  nextDueDate: isoDateSchema.nullable(),
  hasOverdue: z.boolean(),
  parentProjectId: z.string().nullable(),
  /** The initial booking; contract value = this + extra work (upsell entries). */
  expectedAmountMinor: z.number().default(0),
  milestoneCount: z.number().default(0),
  /** Milestones paid in full. */
  paidMilestoneCount: z.number().default(0),
});
export type ProjectListItem = z.infer<typeof projectListItemSchema>;

export const projectDetailSchema = projectListItemSchema.extend({
  description: z.string(),
  startDate: isoDateSchema.nullable(),
  durationValue: z.number().nullable(),
  durationUnit: z.enum(['WEEKS', 'MONTHS']).nullable(),
  endDate: isoDateSchema.nullable(),
  closedAt: isoDateSchema.nullable(),
  expectedAmountMinor: z.number(),
  tags: z.array(z.string()),
  parent: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  /** D-028: 1 for an original project that has phases, 2.. for its phases (by code), null for a standalone project. */
  phase: z.number().nullable().default(null),
  /** D-037: set on a phase only. */
  phaseKind: z.enum(['UPSELL', 'SCOPE']).nullable().default(null),
  upsellProjects: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      status: projectStatusSchema,
      phase: z.number().default(0),
      phaseKind: z.enum(['UPSELL', 'SCOPE']).default('UPSELL'),
      expectedAmountMinor: z.number().default(0),
      contractValueMinor: z.number().default(0),
      collectedMinor: z.number().default(0),
    }),
  ),
  upsellEntries: z.array(
    z.object({
      id: z.string(),
      amountMinor: z.number(),
      date: isoDateSchema,
      note: z.string().nullable(),
      milestoneId: z.string().nullable().default(null),
    }),
  ),
  milestones: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      title: z.string(),
      invoiceId: z.string().nullable().default(null),
      amountMinor: z.number(),
      dueDate: isoDateSchema.nullable(),
      paidMinor: z.number(),
      balanceMinor: z.number(),
      /** D-055: date of the latest payment still standing, and that payment (its date can be changed). */
      paidOn: isoDateSchema.nullable().default(null),
      paidPaymentId: z.string().nullable().default(null),
      /** D-063: the recurring series that created it, if any. */
      recurringSeriesId: z.string().nullable().default(null),
      isUpsell: z.boolean().default(false),
      status: z.enum(['PAID', 'OVERDUE', 'PARTIALLY_PAID', 'DUE_SOON', 'SCHEDULED', 'UNSCHEDULED']),
    }),
  ),
  scheduledMinor: z.number(),
  unscheduledMinor: z.number(),
  /** D-063: monthly recurring milestones; each month's milestone is created on its date. */
  recurring: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        amountMinor: z.number(),
        startDate: isoDateSchema,
        count: z.number(),
        createdCount: z.number(),
        /** The next invoice date still to come, null when all are created. */
        nextDate: isoDateSchema.nullable(),
      }),
    )
    .default([]),
  updatedAt: z.string(),
  canEdit: z.boolean(),
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

export const upsellEntrySchema = z.object({
  amountMinor: positiveMinorSchema,
  date: isoDateSchema,
  note: text(500).optional(),
  /** D-038: when given, a milestone for this amount is created too (marked Upsell). */
  dueDate: isoDateSchema.optional(),
});
export type UpsellEntryInput = z.infer<typeof upsellEntrySchema>;

export const setParentSchema = z.object({ parentProjectId: z.string().min(1).nullable() });
export type SetParentInput = z.infer<typeof setParentSchema>;

export const updateMilestoneSchema = z
  .object({
    title: text(200).min(1).optional(),
    invoiceId: text(80).nullable().optional(),
    description: text(2000).nullable().optional(),
    amountMinor: positiveMinorSchema.optional(),
    dueDate: isoDateSchema.nullable().optional(),
  })
  .strict();
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

export const reorderMilestonesSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(50) });

/** D-063: a monthly recurring milestone: `count` invoices of `amountMinor`, on the start date's day each month. */
export const createRecurringSchema = z.object({
  title: text(160).min(1, 'Enter the milestone task'),
  amountMinor: positiveMinorSchema,
  startDate: isoDateSchema,
  count: z.number().int().min(1, 'At least one invoice').max(120, 'At most 120 invoices'),
});
export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;

export const extendRecurringSchema = z.object({ months: z.number().int().min(1).max(120) });
