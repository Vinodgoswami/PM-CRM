import { cva, type VariantProps } from 'class-variance-authority';
import { type ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-accent text-text-muted',
      primary: 'bg-accent text-primary',
      success: 'bg-[color-mix(in_oklch,var(--success)_15%,transparent)] text-success',
      warning: 'bg-[color-mix(in_oklch,var(--warning)_20%,transparent)] text-[color-mix(in_oklch,var(--warning)_70%,var(--text))]',
      danger: 'bg-[color-mix(in_oklch,var(--danger)_15%,transparent)] text-danger',
      info: 'bg-[color-mix(in_oklch,var(--info)_15%,transparent)] text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
