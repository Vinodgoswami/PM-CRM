import { z } from 'zod';
import { isoDateSchema, minorSchema } from './projects';

export const dashboardQuerySchema = z.object({
  period: z.enum(['THIS_MONTH', 'THIS_QUARTER', 'THIS_FY', 'LAST_FY', 'ALL']).default('THIS_FY'),
  ownerId: z.string().optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

const ref = z.object({ id: z.string(), name: z.string() });
const kpis = z.object({
  bookedMinor: minorSchema,
  upsellMinor: minorSchema,
  collectedMinor: minorSchema,
  expectedMinor: minorSchema,
  collectionRate: z.number().nullable(),
  outstandingMinor: minorSchema,
  overdueMinor: minorSchema,
  overdueCount: z.number(),
  dueNext30Minor: minorSchema,
  pipelineMinor: minorSchema,
  wonCount: z.number(),
  avgDealMinor: minorSchema.nullable(),
});

export const dashboardSchema = z.object({
  currency: z.string(),
  /** M-4: projects in another currency are left out of every total; the page shows this count. */
  otherCurrencyProjects: z.number(),
  period: z.object({ key: z.string(), from: isoDateSchema.nullable(), to: isoDateSchema.nullable() }),
  kpis,
  previous: z.object({ bookedMinor: minorSchema, collectedMinor: minorSchema }).nullable(),
  monthly: z.array(z.object({ month: z.string(), bookedMinor: minorSchema, collectedMinor: minorSchema, expectedMinor: minorSchema })),
  forecast: z.array(z.object({ month: z.string(), scheduledMinor: minorSchema })),
  aging: z.object({ d1_30: minorSchema, d31_60: minorSchema, d61_90: minorSchema, d90plus: minorSchema }),
  topClients: z.array(z.object({ id: z.string(), name: z.string(), bookedMinor: minorSchema, collectedMinor: minorSchema })),
  team: z
    .array(
      z.object({
        user: ref,
        bookedMinor: minorSchema,
        collectedMinor: minorSchema,
        outstandingMinor: minorSchema,
        overdueMinor: minorSchema,
        upsellMinor: minorSchema,
        activeProjects: z.number(),
      }),
    )
    .nullable(),
  upcoming: z.array(
    z.object({
      milestoneId: z.string(),
      number: z.number(),
      title: z.string(),
      balanceMinor: minorSchema,
      dueDate: isoDateSchema,
      project: z.object({ id: z.string(), code: z.string(), name: z.string() }),
      client: ref,
    }),
  ),
  recentPayments: z.array(
    z.object({
      id: z.string(),
      amountMinor: minorSchema,
      paymentDate: isoDateSchema,
      invoiceId: z.string().nullable(),
      project: z.object({ id: z.string(), code: z.string(), name: z.string() }),
      client: ref,
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
