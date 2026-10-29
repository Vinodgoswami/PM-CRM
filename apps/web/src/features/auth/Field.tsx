import { Input, Label } from '@salescrm/ui';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { type ComponentProps, useId, useState } from 'react';

/** Labelled input with an optional leading icon, a show/hide toggle for passwords, and an accessible error. */
export function Field({
  label,
  error,
  icon: Icon,
  type,
  ...input
}: { label: string; error?: string; icon?: LucideIcon } & ComponentProps<'input'>) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {Icon && <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted" />}
        <Input
          id={id}
          type={isPassword && reveal ? 'text' : type}
          className={`h-11 rounded-full bg-white ${Icon ? 'pl-10' : 'pl-4'} ${isPassword ? 'pr-11' : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...input}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-text-muted hover:text-text"
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
