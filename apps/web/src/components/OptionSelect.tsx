import { Select, type SelectOption } from '@salescrm/ui';
import { Children, isValidElement, type ReactNode } from 'react';

/** Reads <option value="…">Label</option> children into options for the custom Select. */
function optionsFrom(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return;
    const label = Children.toArray(child.props.children).join('');
    out.push({ value: String(child.props.value ?? label), label, ...(child.props.disabled ? { disabled: true } : {}) });
  });
  return out;
}

/**
 * Drop-in for a native <select> written with <option> children, rendered as our own dropdown (opens below, styled).
 * Use `onValueChange(value)` instead of `onChange(event)`.
 */
export function OptionSelect({
  children,
  value,
  onValueChange,
  ...rest
}: {
  children: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}) {
  return <Select value={value} onValueChange={onValueChange} options={optionsFrom(children)} {...rest} />;
}
