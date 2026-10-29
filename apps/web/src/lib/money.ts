import { formatMoney, minorFromJson } from '@salescrm/types';

/** Formats an API money value (minor units as a JSON integer) for display. */
export function formatApiMoney(minor: number, currency: string): string {
  return formatMoney(minorFromJson(minor), currency);
}
