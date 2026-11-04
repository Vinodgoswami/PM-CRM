import { convertMinor } from '@salescrm/types';

/**
 * D-036: every money figure of a dashboard (keys ending in "Minor") converted from the base currency into the
 * viewer's own at one rate. Counts, dates and percentages are left as they are.
 */
export function convertMoneyFields<T>(value: T, rate: string, from: string, to: string): T {
  const walk = (v: unknown, key?: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if (typeof v === 'number' && key?.endsWith('Minor')) return Number(convertMinor(BigInt(v), rate, from, to));
    return v;
  };
  return walk(value) as T;
}
