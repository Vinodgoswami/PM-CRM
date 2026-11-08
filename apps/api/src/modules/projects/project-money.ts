import { type IsoDate, projectTotals, type ProjectTotals } from '@salescrm/core';
import { type Prisma } from '@salescrm/database';

/** The Prisma `include` every totals computation needs. */
export const PROJECT_MONEY_INCLUDE = {
  upsellEntries: { select: { amountMinor: true } },
  milestones: { select: { amountMinor: true, dueDate: true, payments: { select: { amountMinor: true } } } },
} satisfies Prisma.ProjectInclude;

type ProjectWithMoney = Pick<
  Prisma.ProjectGetPayload<{ include: typeof PROJECT_MONEY_INCLUDE }>,
  'expectedAmountMinor' | 'upsellEntries' | 'milestones' | 'status'
>;

const BOOKED: string[] = ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

export const isoDate = (d: Date | null): IsoDate | null => (d ? d.toISOString().slice(0, 10) : null);

/** docs/05 derived values for one project row loaded with PROJECT_MONEY_INCLUDE. */
export function totalsFor(project: ProjectWithMoney, today: IsoDate): ProjectTotals {
  return projectTotals(
    {
      expectedAmountMinor: project.expectedAmountMinor,
      upsellEntries: project.upsellEntries,
      milestones: project.milestones.map((m) => ({
        amountMinor: m.amountMinor,
        dueDate: isoDate(m.dueDate),
        paidMinor: m.payments.reduce((s, p) => s + p.amountMinor, 0n),
      })),
      // D-061: only confirmed work has money outstanding.
      booked: BOOKED.includes(project.status),
    },
    today,
  );
}
