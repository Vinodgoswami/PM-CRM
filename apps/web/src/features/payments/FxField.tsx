import { fxRateSchema } from '@salescrm/schemas';
import { Input, Label } from '@salescrm/ui';
import { convertMinor, formatMoney, minorFromJson } from '@salescrm/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiFetch } from '../../lib/api';

/** Converted amount for display, or null when the rate is not a valid positive number yet. */
export function converted(amountMinor: number | null, rate: string, from: string, to: string): string | null {
  if (amountMinor === null) return null;
  try {
    return formatMoney(convertMinor(minorFromJson(amountMinor), rate, from, to), to);
  } catch {
    return null;
  }
}

/**
 * D-020: exchange-rate input for a payment in another currency than the company's. Pre-filled with the day's rate
 * from the server (which caches the public rate service); the user may type their bank's actual rate instead.
 */
export function FxField({
  id,
  from,
  to,
  date,
  amountMinor,
  value,
  onChange,
}: {
  id: string;
  from: string;
  to: string;
  date: string;
  amountMinor: number | null;
  value: string;
  onChange: (rate: string) => void;
}) {
  const typed = useRef(false);
  const lookup = useQuery({
    queryKey: ['fx-rate', from, to, date],
    queryFn: () => apiFetch(`/fx-rate?${new URLSearchParams({ from, to, date })}`, { schema: fxRateSchema }),
    retry: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    // A looked-up rate fills the field until the user types their own.
    if (lookup.data && !typed.current) onChange(lookup.data.rate);
  }, [lookup.data, onChange]);
  const shown = converted(amountMinor, value, from, to);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Exchange rate (1 {from} in {to})
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        placeholder="e.g. 0.0119"
      />
      {lookup.isError && !value && <p className="text-xs text-danger">No rate found for this date. Enter the rate you received.</p>}
      {shown && <p className="text-xs text-text-muted">= {shown} received</p>}
      {lookup.data && !typed.current && (
        <p className="text-xs text-text-muted">Rate for {lookup.data.date}; change it to your bank&apos;s rate if different.</p>
      )}
    </div>
  );
}
