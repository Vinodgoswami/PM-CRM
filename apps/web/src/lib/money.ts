import { convertMinor, formatMoney, minorFromJson } from '@salescrm/types';

/** Formats an API money value (minor units as a JSON integer) for display. */
export function formatApiMoney(minor: number, currency: string): string {
  return formatMoney(minorFromJson(minor), currency);
}

/** D-067: the viewer's currency and a project's rate into it, as the API sends them with each project. */
export interface ViewRate {
  currency: string;
  rate: string | null;
}

/** D-067: an amount in a project's currency, shown in the viewer's currency at the project's rate (else as it is). */
export function formatViewMoney(minor: number, from: string, view: ViewRate | null | undefined): string {
  if (!view || view.currency === from || !view.rate) return formatApiMoney(minor, from);
  return formatMoney(convertMinor(minorFromJson(minor), view.rate, from, view.currency), view.currency);
}
