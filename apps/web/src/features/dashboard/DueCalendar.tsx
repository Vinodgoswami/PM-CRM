import { type InvoiceItem, invoicesResponseSchema } from '@salescrm/schemas';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { apiFetch } from '../../lib/api';
import { formatApiMoney } from '../../lib/money';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n: number) => String(n).padStart(2, '0');
const monthTitle = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Unpaid milestone balances laid out by due date, one month at a time (docs/09 C1 calendar). */
export function DueCalendar({ ownerId, currency }: { ownerId: string; currency: string }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);
  const search = ownerId ? `?${new URLSearchParams({ ownerId })}` : '';
  const { data } = useQuery({
    queryKey: ['invoices', search],
    queryFn: () => apiFetch(`/invoices${search}`, { schema: invoicesResponseSchema }),
  });

  const byDay = new Map<string, InvoiceItem[]>();
  for (const item of data?.groups.flatMap((g) => g.items) ?? []) {
    if (item.dueDate) byDay.set(item.dueDate, [...(byDay.get(item.dueDate) ?? []), item]);
  }
  // Base currency only, so a day's total never mixes currencies (M-4).
  const dayTotal = (items: InvoiceItem[]) => items.filter((i) => i.currency === currency).reduce((s, i) => s + i.balanceMinor, 0);
  const max = Math.max(1, ...[...byDay.values()].map(dayTotal));

  const { y, m } = cursor;
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const shift = (d: number) => {
    setSelected(null);
    setCursor(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));
  };
  const picked = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shift(-1)}
          className="grid size-8 place-items-center rounded-full border border-border hover:bg-accent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="font-semibold">{monthTitle(y, m)}</p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shift(1)}
          className="grid size-8 place-items-center rounded-full border border-border hover:bg-accent"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-text-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const key = `${y}-${pad(m + 1)}-${pad(d)}`;
          const items = byDay.get(key);
          const total = items ? dayTotal(items) : 0;
          const overdue = items?.some((it) => it.status === 'OVERDUE');
          const label = `${d} ${monthTitle(y, m)}${items ? `: ${formatApiMoney(total, currency)} due` : ''}`;
          return (
            <button
              key={key}
              type="button"
              aria-label={label}
              aria-pressed={selected === key}
              disabled={!items}
              onClick={() => setSelected(selected === key ? null : key)}
              // D-029: due days ahead are a light green, days already past (unpaid) a light red; stronger for bigger sums.
              data-tone={items ? (key < todayKey || overdue ? 'past' : 'upcoming') : undefined}
              style={
                items
                  ? {
                      backgroundColor: `color-mix(in oklab, var(--color-${key < todayKey || overdue ? 'danger' : 'primary'}) ${
                        12 + Math.round((total / max) * 22)
                      }%, transparent)`,
                    }
                  : undefined
              }
              className={`aspect-square rounded-lg text-sm tabular-nums transition-shadow ${
                items ? (key < todayKey || overdue ? 'font-semibold text-danger' : 'font-semibold text-primary-strong') : 'text-text-muted'
              } ${key === todayKey ? 'ring-2 ring-primary/50' : ''} ${selected === key ? 'ring-2 ring-text' : ''}`}
            >
              {d}
            </button>
          );
        })}
      </div>
      {picked.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {picked.map((it) => (
            <li key={it.milestoneId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <Link to={`/projects/${it.project.id}`} className="block truncate font-medium hover:underline">
                  M{it.number} {it.title}
                </Link>
                <p className="truncate text-xs text-text-muted">
                  {it.client.name} · {it.project.code}
                </p>
              </div>
              <span className="font-semibold tabular-nums">{formatApiMoney(it.balanceMinor, it.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
