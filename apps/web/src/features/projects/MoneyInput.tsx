import { currencyDigits, MoneyParseError, minorToJson, toMinor } from '@salescrm/types';
import { Input } from '@salescrm/ui';
import { type ComponentProps, useEffect, useRef, useState } from 'react';

/** Parses typed amounts with the shared money rules (M-1); reports minor units, or null with a message. */
export function MoneyInput({
  currency,
  defaultMinor,
  onValue,
  ...props
}: { currency: string; defaultMinor?: number; onValue: (minor: number | null, error: string | null) => void } & Omit<
  ComponentProps<'input'>,
  'onChange' | 'defaultValue'
>) {
  const [text, setText] = useState(defaultMinor ? minorToText(defaultMinor, currency) : '');
  const report = useRef(onValue);
  report.current = onValue;

  const parse = (value: string) => {
    if (!value.trim()) return report.current(null, 'Enter an amount');
    try {
      const minor = toMinor(value, currency);
      if (minor <= 0n) return report.current(null, 'Enter an amount above zero');
      report.current(minorToJson(minor), null);
    } catch (err) {
      report.current(null, err instanceof MoneyParseError ? 'Enter an amount like 1,25,000.50' : 'Amount is too large');
    }
  };

  // The same typed text means a different number of minor units in another currency (₹ has 2 decimals, ¥ none).
  const lastCurrency = useRef(currency);
  useEffect(() => {
    if (lastCurrency.current === currency) return;
    lastCurrency.current = currency;
    if (text) parse(text);
  }); // runs after every render; re-parses only when the currency actually changed

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-text-muted">{currency}</span>
      <Input
        inputMode="decimal"
        className="pl-12 text-right tabular-nums"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          parse(e.target.value);
        }}
        {...props}
      />
    </div>
  );
}

/** 1250050 (INR) → "12500.50", without floating point. */
function minorToText(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  if (digits === 0) return String(minor);
  const s = String(minor).padStart(digits + 1, '0');
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`;
}
