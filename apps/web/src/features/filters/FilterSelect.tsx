import { type ReactNode, useId } from 'react';

/** Labelled pill-style select used in page filter bars. */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-full border border-border bg-surface px-4 text-sm text-text"
      >
        {children}
      </select>
    </label>
  );
}
