import { motion } from 'motion/react';
import { useState } from 'react';
import { formatApiMoney } from '../../lib/money';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

/** Reference-style bars: hatched, rounded, with the highlighted bar solid and labelled. */
export function HatchedBars({
  data,
  currency,
  highlightIndex,
  label,
  onSelect,
}: {
  data: { key: string; label: string; value: number }[];
  currency: string;
  highlightIndex: number;
  label: string;
  /** Click / Enter on a bar: open its drill-down. */
  onSelect?: (key: string) => void;
}) {
  const [active, setActive] = useState(highlightIndex);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure aria-label={label} className="flex h-52 items-end gap-2 sm:gap-3">
      {data.map((d, i) => {
        const h = Math.max(4, (d.value / max) * 100);
        const on = i === active;
        return (
          <button
            key={d.key}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => onSelect?.(d.key)}
            aria-label={`${d.label}: ${formatApiMoney(d.value, currency)}`}
            className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            {on && (
              <motion.span
                layoutId={`${label}-tip`}
                className={`absolute z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow ${
                  h > 80 ? 'bg-white text-primary' : 'bg-primary text-primary-contrast'
                }`}
                // Tall bars carry their label inside the top of the bar so it never overlaps the card header.
                style={{ bottom: h > 80 ? `calc(${h}% - 0.5rem)` : `calc(${h}% + 1.75rem)` }}
              >
                {formatApiMoney(d.value, currency).replace(/\.00$/, '')}
              </motion.span>
            )}
            <motion.span
              className={`w-full max-w-10 rounded-full ${on ? 'bg-primary' : 'hatch bg-accent'}`}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: i * 0.04, duration: 0.6, ease: [0.2, 0, 0, 1] }}
            />
            <span className={`text-[11px] ${on ? 'font-semibold text-text' : 'text-text-muted'}`}>{d.label}</span>
          </button>
        );
      })}
    </figure>
  );
}

/** Smooth area line like the reference's balance card, drawn from the cash-in forecast. */
export function Wave({ values }: { values: number[] }) {
  const w = 300;
  const h = 90;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 10 - (v / max) * (h - 25)] as const);
  const line = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1]!;
    const cx = (px + x) / 2;
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, '');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" aria-hidden preserveAspectRatio="none">
      <defs>
        <linearGradient id="wave-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${line} L${w},${h} L0,${h} Z`}
        fill="url(#wave-fill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: [0.2, 0, 0, 1] }}
      />
    </svg>
  );
}

/** Tiny trend line for a KPI card (12 monthly values, oldest first). */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 96;
  const h = 28;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const d = values
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / (max - min || 1)) * (h - 4)).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} className="h-7 w-24 shrink-0 overflow-visible">
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
