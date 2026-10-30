/**
 * Money is integer minor units (paise / cents) end to end (rule M-1). Formatting happens only at the edge (M-2).
 * Nothing here converts through floating point.
 */

export class MoneyParseError extends Error {
  constructor(
    input: string,
    readonly reason: string,
  ) {
    super(`Invalid amount "${input}": ${reason}`);
    this.name = 'MoneyParseError';
  }
}

const digitsCache = new Map<string, number>();

export function currencyDigits(currency: string): number {
  const cached = digitsCache.get(currency);
  if (cached !== undefined) return cached;
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  digitsCache.set(currency, digits);
  return digits;
}

// Plain digits, western grouping (1,250,000) or Indian grouping (12,50,000), with an optional fraction.
// Mixed groups like "1,500,00" are rejected: a misplaced comma must not silently become a 100x amount.
const AMOUNT = /^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.(\d+))?$/;

export function toMinor(input: string, currency: string): bigint {
  const text = input.trim();
  const match = AMOUNT.exec(text);
  if (!match) throw new MoneyParseError(input, 'expected a positive number like 1,25,000.50');
  const digits = currencyDigits(currency);
  const fraction = match[1] ?? '';
  if (fraction.length > digits) throw new MoneyParseError(input, `${currency} allows at most ${digits} decimal places`);
  const whole = text.split('.')[0]!.replaceAll(',', '');
  return BigInt(whole + fraction.padEnd(digits, '0'));
}

export function formatMoney(minor: bigint, currency: string, locale = 'en-IN'): string {
  const digits = currencyDigits(currency);
  const negative = minor < 0n;
  const abs = (negative ? -minor : minor).toString().padStart(digits + 1, '0');
  const whole = digits === 0 ? abs : abs.slice(0, -digits);
  const decimal = digits === 0 ? whole : `${whole}.${abs.slice(-digits)}`;
  // A decimal string keeps full precision; Intl formats it without converting to a float.
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
  return formatter.format(`${negative ? '-' : ''}${decimal}` as Intl.StringNumericLiteral);
}

export function sumMinor(values: readonly bigint[]): bigint {
  return values.reduce((total, v) => total + v, 0n);
}

export function minorToJson(minor: bigint): number {
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Amount ${minor} exceeds the safe JSON integer range`);
  }
  return Number(minor);
}

export function minorFromJson(value: number): bigint {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Amount ${value} must be a safe integer of minor units`);
  return BigInt(value);
}
