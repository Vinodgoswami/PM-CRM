import { OptionSelect } from './OptionSelect';

/** Currencies the daily exchange-rate service covers (D-020); others still show if already in use. */
export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'INR', name: 'Indian rupee' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'JPY', name: 'Japanese yen' },
];

export function CurrencySelect({
  id,
  value,
  onChange,
  disabled,
  className = 'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm',
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options = CURRENCIES.some((c) => c.code === value) ? CURRENCIES : [{ code: value, name: value }, ...CURRENCIES];
  return (
    <OptionSelect id={id} className={className} value={value} onValueChange={onChange} disabled={disabled}>
      {options.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code === c.name ? c.code : `${c.code} — ${c.name}`}
        </option>
      ))}
    </OptionSelect>
  );
}
