import { type Dashboard } from '@salescrm/schemas';
import { motion } from 'motion/react';
import { useState } from 'react';
import { formatApiMoney } from '../../lib/money';
import { monthLabel } from './charts';

type Money = (minor: number) => string;
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part * 100) / whole) : 0);

/** Booked / collected toggle shared by the comparison charts. */
export function SeriesToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-background p-1 text-xs print:hidden">
      {options.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={`rounded-full px-3 py-1 capitalize ${value === s ? 'bg-primary font-semibold text-primary-contrast' : 'text-text-muted'}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/** C2: one pair of bars per quarter — this FY solid, the year before hatched. */
export function QuarterBars({ data, series, money }: { data: Dashboard['quarters']; series: 'booked' | 'collected'; money: Money }) {
  const pick = (q: Dashboard['quarters'][number]) =>
    series === 'booked' ? [q.bookedMinor, q.prevBookedMinor] : [q.collectedMinor, q.prevCollectedMinor];
  const max = Math.max(1, ...data.flatMap(pick));
  return (
    <div>
      <div className="flex h-44 items-end gap-4">
        {data.map((q, i) => {
          const [now, before] = pick(q) as [number, number];
          return (
            <div
              key={q.label}
              role="img"
              aria-label={`${q.label}: ${series} ${money(now)}, last year ${money(before)}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <div className="flex h-full w-full items-end justify-center gap-1.5">
                <motion.span
                  className="hatch w-full max-w-7 rounded-full bg-accent"
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(3, (before / max) * 100)}%` }}
                  transition={{ delay: i * 0.05, duration: 0.6 }}
                />
                <motion.span
                  className="w-full max-w-7 rounded-full bg-primary"
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(3, (now / max) * 100)}%` }}
                  transition={{ delay: 0.05 + i * 0.05, duration: 0.6 }}
                />
              </div>
              <span className="text-xs text-text-muted">{q.label}</span>
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          ['hatch bg-accent', 'Last year'],
          ['bg-primary', 'This year'],
        ]}
      />
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <p className="mt-3 flex gap-4 text-xs text-text-muted">
      {items.map(([cls, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`size-2.5 rounded-full ${cls}`} />
          {label}
        </span>
      ))}
    </p>
  );
}

/** C3: cumulative collected, this FY (solid, to date) against last FY (dashed). */
export function YoyLine({ data, money }: { data: Dashboard['yearOverYear']; money: Money }) {
  const W = 320;
  const H = 150;
  const max = Math.max(1, ...data.map((d) => Math.max(d.cumulativeMinor ?? 0, d.previousCumulativeMinor)));
  const x = (i: number) => (i / Math.max(1, data.length - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 8) - 4;
  const now = data.filter((d) => d.cumulativeMinor !== null);
  const last = now.at(-1);
  const lastIdx = now.length - 1;
  const line = (pts: [number, number][]) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const label = last
    ? `Collected so far ${money(last.cumulativeMinor!)} vs ${money(data[lastIdx]!.previousCumulativeMinor)} at the same point last year`
    : 'No collections yet this year';
  return (
    <div>
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H + 18}`} className="w-full overflow-visible">
        <path
          d={line(data.map((d, i) => [x(i), y(d.previousCumulativeMinor)]))}
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <motion.path
          d={line(now.map((d, i) => [x(i), y(d.cumulativeMinor!)]))}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9 }}
        />
        {last && <circle cx={x(lastIdx)} cy={y(last.cumulativeMinor!)} r="4.5" fill="var(--color-primary)" />}
        {data.map((d, i) =>
          i % 2 === 0 ? (
            <text key={d.month} x={x(i)} y={H + 16} textAnchor="middle" className="fill-text-muted text-[10px]">
              {monthLabel(d.month)}
            </text>
          ) : null,
        )}
      </svg>
      <Legend
        items={[
          ['bg-primary', 'This year'],
          ['bg-text-muted', 'Last year'],
        ]}
      />
    </div>
  );
}

/** C6: collected per client (booked as the faint track), top 10 then Others. */
export function ClientBars({ data, money }: { data: Dashboard['clientRevenue']; money: Money }) {
  if (data.length === 0) return <p className="text-sm text-text-muted">No client activity in this period.</p>;
  const max = Math.max(1, ...data.map((c) => Math.max(c.bookedMinor, c.collectedMinor)));
  return (
    <ul className="space-y-2.5">
      {data.map((c, i) => (
        <li key={c.id ?? 'others'} className="space-y-1">
          <div className="flex justify-between gap-3 text-sm">
            <span className={`truncate ${c.id ? 'font-medium' : 'text-text-muted'}`}>{c.name}</span>
            <span className="font-semibold tabular-nums">{money(c.collectedMinor)}</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-background" title={`Booked ${money(c.bookedMinor)}`}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(c.bookedMinor / max) * 100}%` }} />
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${(c.collectedMinor / max) * 100}%` }}
              transition={{ delay: i * 0.03, duration: 0.6 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** C7: booked split into new business and upsell. */
export function UpsellDonut({ bookedMinor, upsellMinor, money }: { bookedMinor: number; upsellMinor: number; money: Money }) {
  const newMinor = bookedMinor - upsellMinor;
  const pctNew = share(newMinor, bookedMinor);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="size-32 shrink-0 -rotate-90" aria-hidden>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="18" />
        <motion.circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - (bookedMinor > 0 ? newMinor / bookedMinor : 0)) }}
          transition={{ duration: 0.9 }}
        />
      </svg>
      <ul className="space-y-3 text-sm">
        {(
          [
            ['New', 'bg-primary', pctNew, newMinor],
            ['Upsell', 'bg-accent', bookedMinor > 0 ? 100 - pctNew : 0, upsellMinor],
          ] as const
        ).map(([name, cls, pct, value]) => (
          <li key={name}>
            <p className="flex items-center gap-2">
              <span aria-hidden className={`size-2.5 rounded-full ${cls}`} />
              <span className="text-text-muted">{name}</span>
              <span className="font-bold">{pct}%</span>
            </p>
            <p className="pl-4.5 tabular-nums">{money(value)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STAGE: Record<string, string> = {
  LEAD: 'Lead',
  PROPOSAL: 'Proposal',
  WON: 'Won',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  LOST: 'Lost',
};

/** C8: projects by current status, bar width by count. */
export function Funnel({ data, money }: { data: Dashboard['funnel']; money: Money }) {
  const max = Math.max(1, ...data.map((f) => f.count));
  return (
    <ul className="space-y-2">
      {data.map((f, i) => (
        <li key={f.status} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-sm">
          <span className="text-text-muted">{STAGE[f.status] ?? f.status}</span>
          <div className="relative h-8 overflow-hidden rounded-full bg-background">
            <motion.div
              className={`absolute inset-y-0 left-0 rounded-full ${f.status === 'LOST' ? 'bg-danger/20' : i < 2 ? 'hatch bg-accent' : 'bg-primary/80'}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, (f.count / max) * 100)}%` }}
              transition={{ delay: i * 0.05, duration: 0.6 }}
            />
            <span className="relative flex h-full items-center px-3 text-xs font-semibold tabular-nums">
              {f.count} · {money(f.valueMinor)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Small 12-month booked / collected bars for a team row. */
export function MiniBars({
  name,
  data,
  currency,
}: {
  name: string;
  data: { month: string; bookedMinor: number; collectedMinor: number }[];
  currency: string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.bookedMinor, d.collectedMinor]));
  const [active, setActive] = useState<number | null>(null);
  const d = active === null ? null : data[active];
  return (
    <div>
      <div role="img" aria-label={`${name}, last 12 months: booked and collected`} className="flex h-20 items-end gap-1.5">
        {data.map((m, i) => (
          <div
            key={m.month}
            className="flex h-full flex-1 items-end gap-0.5"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="hatch w-full rounded-sm bg-accent" style={{ height: `${Math.max(2, (m.bookedMinor / max) * 100)}%` }} />
            <span className="w-full rounded-sm bg-primary" style={{ height: `${Math.max(2, (m.collectedMinor / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-text-muted">
        {d
          ? `${monthLabel(d.month)}: booked ${formatApiMoney(d.bookedMinor, currency)}, collected ${formatApiMoney(d.collectedMinor, currency)}`
          : 'Hatched = booked, solid = collected. Hover a month for numbers.'}
      </p>
    </div>
  );
}
