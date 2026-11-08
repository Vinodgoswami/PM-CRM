import { type IsoDate } from './period';

/** D-063: `count` due dates, one a month on the start date's day (the month's last day when it is shorter). */
export function recurringDates(start: IsoDate, count: number): IsoDate[] {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  return Array.from({ length: count }, (_, i) => {
    const last = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + i, Math.min(d, last))).toISOString().slice(0, 10);
  });
}

/** D-063: the positions (0-based) of the invoices due by `today` that are not created yet; created ones come first. */
export function dueRecurringIndexes(start: IsoDate, count: number, created: number, today: IsoDate): number[] {
  return recurringDates(start, count)
    .map((date, i) => ({ date, i }))
    .filter(({ date, i }) => i >= created && date <= today)
    .map(({ i }) => i);
}
