import { fyOf, type IsoDate, quarterOf } from './period';

export const PERIODS = [
  { key: 'THIS_MONTH', label: 'This month' },
  { key: 'THIS_QUARTER', label: 'This quarter' },
  { key: 'THIS_FY', label: 'This financial year' },
  { key: 'LAST_FY', label: 'Last financial year' },
  { key: 'ALL', label: 'All time' },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];

const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

/** Date range for a preset, using the company's financial year start (PR-1, PR-2). */
export function periodRange(key: PeriodKey, today: IsoDate, fyStartMonth: number): { from?: IsoDate; to?: IsoDate } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  switch (key) {
    case 'THIS_MONTH':
      return { from: `${today.slice(0, 7)}-01`, to: monthEnd(y, m) };
    case 'THIS_QUARTER': {
      const q = quarterOf(today, fyStartMonth, 'fy');
      return { from: q.start, to: q.end };
    }
    case 'THIS_FY': {
      const fy = fyOf(today, fyStartMonth);
      return { from: fy.start, to: fy.end };
    }
    case 'LAST_FY': {
      const prev = fyOf(fyOf(today, fyStartMonth).start, fyStartMonth);
      const before = fyOf(new Date(Date.parse(`${prev.start}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10), fyStartMonth);
      return { from: before.start, to: before.end };
    }
    case 'ALL':
      return {};
  }
}

/** The equally long period just before `key` (previous month / quarter / financial year), for comparisons. */
export function previousRange(key: PeriodKey, today: IsoDate, fyStartMonth: number): { from?: IsoDate; to?: IsoDate } {
  const current = periodRange(key, today, fyStartMonth);
  if (!current.from) return {};
  const dayBefore = new Date(Date.parse(`${current.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  // The same kind of period, evaluated on the day before this one starts ("last FY" is then the FY containing it).
  return periodRange(key === 'LAST_FY' ? 'THIS_FY' : key, dayBefore, fyStartMonth);
}

/**
 * Like-for-like comparison: when the current period is still running, compare it with the same number of days at
 * the start of the previous period (year-to-date vs last year to the same date), not with the whole previous period.
 */
export function comparableRange(key: PeriodKey, today: IsoDate, fyStartMonth: number): { from?: IsoDate; to?: IsoDate } {
  const current = periodRange(key, today, fyStartMonth);
  const previous = previousRange(key, today, fyStartMonth);
  if (!current.from || !current.to || !previous.from || !previous.to) return previous;
  if (today < current.from || today > current.to) return previous; // a finished period compares with a whole one
  const elapsed = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${current.from}T00:00:00Z`)) / 86_400_000);
  const end = new Date(Date.parse(`${previous.from}T00:00:00Z`) + elapsed * 86_400_000).toISOString().slice(0, 10);
  return { from: previous.from, to: end < previous.to ? end : previous.to };
}
