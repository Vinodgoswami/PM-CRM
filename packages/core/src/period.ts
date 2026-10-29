/**
 * Financial periods (rules PR-1, PR-2). Calendar dates are `YYYY-MM-DD` strings; maths is done on integer
 * year/month/day parts so no timezone or DST can shift a date.
 */

export type IsoDate = string;

export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): IsoDate => `${y}-${pad(m)}-${pad(d)}`;

function parts(date: IsoDate): { y: number; m: number } {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return { y, m };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Range from the first day of (y, m) spanning `months` months. Month may overflow past 12. */
function monthSpan(y: number, m: number, months: number): DateRange {
  const startY = y + Math.floor((m - 1) / 12);
  const startM = ((m - 1) % 12) + 1;
  const endIndex = startM - 1 + months - 1;
  const endY = startY + Math.floor(endIndex / 12);
  const endM = (endIndex % 12) + 1;
  return { start: iso(startY, startM, 1), end: iso(endY, endM, daysInMonth(endY, endM)) };
}

export function todayIn(timezone: string, now: Date): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function fyOf(date: IsoDate, fyStartMonth: number): DateRange & { label: string } {
  const { y, m } = parts(date);
  const startYear = m >= fyStartMonth ? y : y - 1;
  const range = monthSpan(startYear, fyStartMonth, 12);
  const label = fyStartMonth === 1 ? String(startYear) : `${startYear}-${String(startYear + 1).slice(-2)}`;
  return { label, ...range };
}

export function quarterOf(date: IsoDate, fyStartMonth: number, basis: 'fy' | 'calendar'): DateRange & { label: 'Q1' | 'Q2' | 'Q3' | 'Q4' } {
  const startMonth = basis === 'calendar' ? 1 : fyStartMonth;
  const { y, m } = parts(date);
  const offset = (m - startMonth + 12) % 12;
  const q = Math.floor(offset / 3);
  const qStartAbs = m - (offset % 3);
  const range = monthSpan(qStartAbs < 1 ? y - 1 : y, qStartAbs < 1 ? qStartAbs + 12 : qStartAbs, 3);
  return { label: `Q${q + 1}` as 'Q1' | 'Q2' | 'Q3' | 'Q4', ...range };
}
