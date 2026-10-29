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
    tags: z.array(text(40).min(1)).max(20).default([]),
    milestones: z.array(milestoneInputSchema).max(50).default([]),
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

export const projectListItemSchema = z.object({
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
  upsellProjects: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), status: projectStatusSchema })),
  upsellEntries: z.array(z.object({ id: z.string(), amountMinor: z.number(), date: isoDateSchema, note: z.string().nullable() })),
  milestones: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      title: z.string(),
      amountMinor: z.number(),
      dueDate: isoDateSchema.nullable(),
      paidMinor: z.number(),
    }),
  ),
  scheduledMinor: z.number(),
  unscheduledMinor: z.number(),
  updatedAt: z.string(),
  canEdit: z.boolean(),
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

export const upsellEntrySchema = z.object({
  amountMinor: positiveMinorSchema,
  date: isoDateSchema,
  note: text(500).optional(),
});
export type UpsellEntryInput = z.infer<typeof upsellEntrySchema>;

export const setParentSchema = z.object({ parentProjectId: z.string().min(1).nullable() });
export type SetParentInput = z.infer<typeof setParentSchema>;
