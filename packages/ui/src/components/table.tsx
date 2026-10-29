import { type ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: ComponentProps<'thead'>) => <thead className={cn('bg-accent/50 text-left', className)} {...p} />;
export const TBody = ({ className, ...p }: ComponentProps<'tbody'>) => (
  <tbody className={cn('[&_tr:last-child]:border-0', className)} {...p} />
);
export const TR = ({ className, ...p }: ComponentProps<'tr'>) => (
  <tr className={cn('border-b border-border transition-colors hover:bg-accent/40', className)} {...p} />
);
export const TH = ({ className, ...p }: ComponentProps<'th'>) => (
  <th className={cn('h-10 px-3 text-xs font-medium whitespace-nowrap text-text-muted', className)} {...p} />
);
export const TD = ({ className, ...p }: ComponentProps<'td'>) => (
  <td className={cn('px-3 py-2.5 align-middle whitespace-nowrap', className)} {...p} />
);
