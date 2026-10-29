import { Input, Label } from '@salescrm/ui';
import { type ComponentProps, useId } from 'react';

/** Labelled input with its validation message wired up for screen readers. */
export function Field({ label, error, ...input }: { label: string; error?: string } & ComponentProps<'input'>) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...input} />
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
