import { type ReactNode, useId } from 'react';
import { OptionSelect } from '../../components/OptionSelect';

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
    <div className="flex flex-col gap-1 text-xs text-text-muted">
      <label htmlFor={id}>{label}</label>
      <OptionSelect id={id} value={value} onValueChange={onChange}>
        {children}
      </OptionSelect>
    </div>
  );
}
