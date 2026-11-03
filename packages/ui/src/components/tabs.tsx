import * as TabsPrimitive from '@radix-ui/react-tabs';
import { type ComponentProps, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

export const Tabs = TabsPrimitive.Root;

/**
 * A frosted bar whose active tab sits on a sliding glass pill (D-029). The pill follows the active trigger by
 * measuring it, so it glides between tabs instead of jumping; reduced-motion users get no slide.
 */
export function TabsList({ className, children, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const place = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      setPill(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    place();
    const changes = new MutationObserver(place);
    changes.observe(list, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    resize?.observe(list);
    return () => {
      changes.disconnect();
      resize?.disconnect();
    };
  }, []);

  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('glass relative inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1 shadow-card', className)}
      {...props}
    >
      {pill && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 rounded-full bg-primary/85 shadow-[inset_0_1px_0_oklch(1_0_0/0.45),0_6px_18px_oklch(0.45_0.1_156/0.35)] backdrop-blur-md transition-[left,width] duration-500 ease-[cubic-bezier(0.3,1.25,0.4,1)] motion-reduce:transition-none"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-text-muted transition-colors duration-300 hover:bg-white/40 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=active]:text-primary-contrast data-[state=active]:hover:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-4 outline-none', className)} {...props} />;
}
