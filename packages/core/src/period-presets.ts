import { fyOf, type IsoDate, quarterOf } from './period';

export const PERIODS = [
  { key: 'THIS_MONTH', label: 'This month' },
  { key: 'THIS_QUARTER', label: 'This quarter' },
  { key: 'FY_TO_DATE', label: 'Financial year to date' },
  { key: 'THIS_FY', label: 'This financial year' },
  { key: 'LAST_FY', label: 'Last financial year' },
  { key: 'TWO_FY', label: 'Last 2 financial years' },
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
    case 'FY_TO_DATE':
      return { from: fyOf(today, fyStartMonth).start, to: today };
    case 'TWO_FY': {
      // Last and this financial year together.
      const last = periodRange('LAST_FY', today, fyStartMonth);
      return { from: last.from, to: fyOf(today, fyStartMonth).end };
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

export interface PeriodBucket {
  label: string;
  from: IsoDate;
  to: IsoDate;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Calendar months from the month of `from` to the month of `to`, both included. */
function monthsBetween(from: IsoDate, to: IsoDate): PeriodBucket[] {
  const out: PeriodBucket[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const last = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ label: MONTH[m - 1]!, from: `${key}-01`, to: monthEnd(y, m) });
    if (key >= last) return out;
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
}

/**
 * D-057: the bars of the dashboard chart for a period preset: weeks of a month, months of a quarter / year to date /
 * financial year, quarters of two financial years, and the last 12 months for all time.
 */
export function periodBuckets(key: PeriodKey, today: IsoDate, fyStartMonth: number): PeriodBucket[] {
  const range = periodRange(key, today, fyStartMonth);
  if (key === 'ALL' || !range.from || !range.to) {
    const [y, m] = today.split('-').map(Number) as [number, number];
    return monthsBetween(new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10), today);
  }
  if (key === 'THIS_MONTH') {
    const [y, m] = today.split('-').map(Number) as [number, number];
    const end = Number(monthEnd(y, m).slice(8));
    const ym = today.slice(0, 7);
    const day = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;
    const out: PeriodBucket[] = [];
    for (let d = 1; d <= end; d += 7) {
      const last = Math.min(d + 6, end);
      out.push({ label: `${d}–${last} ${MONTH[m - 1]}`, from: day(d), to: day(last) });
    }
    return out;
  }
  const months = monthsBetween(range.from, range.to);
  if (key !== 'TWO_FY') return months;
  const out: PeriodBucket[] = [];
  for (let i = 0; i < months.length; i += 3) {
    const [first, , third] = [months[i]!, months[i + 1], months[i + 2] ?? months[i]!];
    out.push({ label: `${first.label}–${third!.label} '${first.from.slice(2, 4)}`, from: first.from, to: third!.to });
  }
  return out;
}
