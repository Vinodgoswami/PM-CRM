import { dueRecurringIndexes, type IsoDate, recurringDates } from '@salescrm/core';
import { type Prisma } from '@salescrm/database';
import { isoDate } from './project-money';

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);

/** D-063: "Support (3/12)". */
export const titleOf = (title: string, i: number, count: number) => `${title} (${i + 1}/${count})`;

/** Creates the series' milestones due by `today`, numbered after the project's last milestone. */
export async function generateRecurring(tx: Prisma.TransactionClient, seriesId: string, today: IsoDate): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "RecurringSeries" WHERE id = ${seriesId} FOR UPDATE`;
  const s = await tx.recurringSeries.findUniqueOrThrow({ where: { id: seriesId } });
  const start = isoDate(s.startDate)!;
  const due = dueRecurringIndexes(start, s.count, s.createdCount, today);
  if (due.length === 0) return;
  const dates = recurringDates(start, s.count);
  // Same lock as other milestone writes on the project, so numbers stay 1..n (MS-1).
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${s.projectId} FOR UPDATE`;
  let number = (await tx.milestone.aggregate({ where: { projectId: s.projectId }, _max: { number: true } }))._max.number ?? 0;
  for (const i of due) {
    number += 1;
    await tx.milestone.create({
      data: {
        projectId: s.projectId,
        number,
        title: titleOf(s.title, i, s.count),
        amountMinor: s.amountMinor,
        dueDate: toDate(dates[i]!),
        createdById: s.createdById,
        recurringSeriesId: s.id,
        recurringIndex: i,
      },
    });
  }
  await tx.recurringSeries.update({ where: { id: s.id }, data: { createdCount: due.at(-1)! + 1 } });
}
