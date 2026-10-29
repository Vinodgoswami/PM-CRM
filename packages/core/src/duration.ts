import { type IsoDate } from './period';

const pad = (n: number) => String(n).padStart(2, '0');

/** docs/06 D-1: end = start + duration; month arithmetic clamps to the last day of the target month. */
export function endDateFor(start: IsoDate | null, value: number | null, unit: 'WEEKS' | 'MONTHS' | null): IsoDate | null {
  if (!start || !value || !unit) return null;
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  if (unit === 'WEEKS') return new Date(Date.UTC(y, m - 1, d + value * 7)).toISOString().slice(0, 10);
  const index = m - 1 + value;
  const ty = y + Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${pad(tm)}-${pad(Math.min(d, last))}`;
}
