import { type ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}
