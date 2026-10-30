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
  /** K11: won ÷ (won + lost) in the period; null when neither happened. */
  winRate: z.number().nullable(),
  avgDealMinor: minorSchema.nullable(),
  /** K10: mean days from due date to payment; negative = paid early. */
  avgDaysToPay: z.number().nullable(),
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
  /** C2: quarters of the selected FY against the same quarters a year earlier. */
  quarters: z.array(
    z.object({
      label: z.string(),
      bookedMinor: minorSchema,
      collectedMinor: minorSchema,
      prevBookedMinor: minorSchema,
      prevCollectedMinor: minorSchema,
    }),
  ),
  /** C3: cumulative collected by FY month; null for months still ahead. */
  yearOverYear: z.array(z.object({ month: z.string(), cumulativeMinor: minorSchema.nullable(), previousCumulativeMinor: minorSchema })),
  /** C6: top 10 clients by collected in the period, then one "Others" row (id null). */
  clientRevenue: z.array(z.object({ id: z.string().nullable(), name: z.string(), bookedMinor: minorSchema, collectedMinor: minorSchema })),
  /** C8: projects by current status. */
  funnel: z.array(z.object({ status: z.string(), count: z.number(), valueMinor: minorSchema })),
  /** T2: overdue milestones, most days overdue first (top 10). */
  overdue: z.array(
    z.object({
      milestoneId: z.string(),
      number: z.number(),
      title: z.string(),
      balanceMinor: minorSchema,
      dueDate: isoDateSchema,
      daysOverdue: z.number(),
      project: z.object({ id: z.string(), code: z.string(), name: z.string() }),
      client: ref,
      owner: ref,
    }),
  ),
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
        winRate: z.number().nullable(),
        avgDealMinor: minorSchema.nullable(),
        monthly: z.array(z.object({ month: z.string(), bookedMinor: minorSchema, collectedMinor: minorSchema })),
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
