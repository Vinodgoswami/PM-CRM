import { type IsoDate } from '@salescrm/core';

/** A source of daily exchange rates: units of `to` per 1 unit of `from` on (or just before) `date`. */
export interface FxProvider {
  readonly name: string;
  rate(from: string, to: string, date: IsoDate): Promise<string | null>;
}
export const FX_PROVIDER = Symbol('FX_PROVIDER');

/** "0.010497" from a JSON number, without exponent notation or trailing zeros. */
const decimal = (n: number) => n.toFixed(10).replace(/\.?0+$/, '');

/**
 * Frankfurter: free European Central Bank reference rates, no key. Only the currency pair and the date are sent.
 * Weekends and holidays answer with the last working day's rate.
 */
export class FrankfurterProvider implements FxProvider {
  readonly name = 'frankfurter';
  async rate(from: string, to: string, date: IsoDate): Promise<string | null> {
    try {
      const url = `https://api.frankfurter.dev/v1/${date}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { rates?: Record<string, number> };
      const value = body.rates?.[to];
      return typeof value === 'number' && value > 0 ? decimal(value) : null;
    } catch {
      return null; // offline or slow: the caller asks for the rate instead
    }
  }
}

/** Deterministic rates for tests and the e2e run: 1 INR = 0.012 USD, 1 USD = 84 INR. */
export class FixedProvider implements FxProvider {
  readonly name = 'fixed';
  private static readonly RATES: Record<string, string> = { 'INR>USD': '0.012', 'USD>INR': '84' };
  async rate(from: string, to: string): Promise<string | null> {
    return FixedProvider.RATES[`${from}>${to}`] ?? null;
  }
}

/** No outside service: every rate is typed in. */
export class OffProvider implements FxProvider {
  readonly name = 'off';
  async rate(): Promise<string | null> {
    return null;
  }
}
