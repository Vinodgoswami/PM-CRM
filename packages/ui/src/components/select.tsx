import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { cn } from '../lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Our own dropdown (no native <select>, no react-select): a labelled button that opens a list directly below it,
 * as wide as the button. Keyboard: arrows, Home/End, Enter/Space to pick, Escape to close, letters to jump.
 */
export function Select({
  id,
  value,
  options,
  onValueChange,
  placeholder = 'Choose…',
  disabled = false,
  className,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: {
  id?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}) {
  const auto = useId();
  const listId = `${id ?? auto}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  const show = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : (enabled[0] ?? 0));
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    setOpen(false);
    if (o.value !== value) onValueChange(o.value);
  };
  const move = (step: number) => {
    const at = enabled.indexOf(active);
    const next = enabled[Math.min(enabled.length - 1, Math.max(0, (at < 0 ? 0 : at) + step))];
    if (next !== undefined) setActive(next);
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      show();
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'Home') setActive(enabled[0] ?? 0);
    else if (e.key === 'End') setActive(enabled.at(-1) ?? 0);
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead: the next option after the current one whose label starts with the letter.
      const letter = e.key.toLowerCase();
      const order = [...enabled.filter((i) => i > active), ...enabled.filter((i) => i <= active)];
      const hit = order.find((i) => options[i]!.label.toLowerCase().startsWith(letter));
      if (hit !== undefined) setActive(hit);
    } else return;
    e.preventDefault();
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(o) => (o ? show() : setOpen(false))}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          onKeyDown={onTriggerKey}
          className={cn(
            'inline-flex h-10 min-w-40 items-center justify-between gap-3 rounded-full border border-border bg-surface pr-3 pl-4 text-left text-sm text-text',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
            'aria-[invalid=true]:border-danger',
            className,
          )}
        >
          <span className={cn('truncate', !selected && 'text-text-muted')}>{selected?.label ?? placeholder}</span>
          <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          side="bottom"
          align="start"
          sideOffset={6}
          // Always below the field, as asked; the list scrolls instead of flipping above.
          avoidCollisions={false}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            listRef.current?.focus();
          }}
          onKeyDown={onListKey}
          className="z-50 max-h-72 w-[var(--radix-popover-trigger-width)] min-w-40 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-card outline-none"
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              data-value={o.value}
              data-active={i === active || undefined}
              onMouseMove={() => !o.disabled && setActive(i)}
              onClick={() => pick(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
                'data-[active]:bg-accent aria-selected:font-semibold aria-selected:text-primary',
                o.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check aria-hidden className="size-4 shrink-0" />}
            </div>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
