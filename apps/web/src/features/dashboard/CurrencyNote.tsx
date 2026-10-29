import { Info } from 'lucide-react';

/** M-4: totals are in the base currency; work in other currencies is listed but never silently added in. */
export function CurrencyNote({ count, noun, currency }: { count: number; noun: string; currency: string }) {
  if (count <= 0) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm">
      <Info className="size-4 text-primary" aria-hidden />
      {count} {noun}
      {count === 1 ? '' : 's'} in other currencies {count === 1 ? 'is' : 'are'} not included in these {currency} totals.
    </p>
  );
}
