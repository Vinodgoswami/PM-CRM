import { Command as CommandPrimitive } from 'cmdk';
import { type ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('flex flex-col', className)} {...props} />;
}
export function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <CommandPrimitive.Input
      className={cn('h-9 w-full border-b border-border bg-transparent px-2 text-sm outline-none', className)}
      {...props}
    />
  );
}
export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('max-h-64 overflow-y-auto py-1', className)} {...props} />;
}
export function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="px-2 py-3 text-sm text-text-muted" {...props} />;
}
export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn('flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent', className)}
      {...props}
    />
  );
}
