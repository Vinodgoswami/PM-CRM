import { type IsoDate } from './period';

export type MilestoneStatus = 'PAID' | 'OVERDUE' | 'PARTIALLY_PAID' | 'DUE_SOON' | 'SCHEDULED' | 'UNSCHEDULED';

const addDays = (d: IsoDate, n: number): IsoDate => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};

/** docs/06 MS-3: derived, never stored; rows are evaluated in this order. */
export function milestoneStatus(
  m: { amountMinor: bigint; paidMinor: bigint; dueDate: IsoDate | null },
  today: IsoDate,
  dueSoonDays: number,
): MilestoneStatus {
  if (m.paidMinor >= m.amountMinor) return 'PAID';
  if (m.dueDate && m.dueDate < today) return 'OVERDUE';
  if (m.paidMinor > 0n) return 'PARTIALLY_PAID';
  if (!m.dueDate) return 'UNSCHEDULED';
  return m.dueDate <= addDays(today, dueSoonDays) ? 'DUE_SOON' : 'SCHEDULED';
}
