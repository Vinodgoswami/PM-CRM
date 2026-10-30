import { type Dashboard } from '@salescrm/schemas';
import { Skeleton, Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router';
import { formatApiMoney } from '../../lib/money';
import { useOwners } from '../filters/api';
import { FilterSelect } from '../filters/FilterSelect';
import { monthLabel } from './charts';
import { CurrencyNote } from './CurrencyNote';
import { isPeriod, type Period, PeriodPicker, useDashboard } from './data';
import { Panel } from './Panel';

type Kpis = Dashboard['kpis'];
type Row = {
  label: string;
  value: (k: Kpis, money: (m: number) => string) => string;
  score: (k: Kpis) => number | null;
  lowerIsBetter?: boolean;
};

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const ROWS: Row[] = [
  { label: 'Contracted', value: (k, m) => m(k.bookedMinor), score: (k) => k.bookedMinor },
  { label: 'Collected', value: (k, m) => m(k.collectedMinor), score: (k) => k.collectedMinor },
  { label: 'Expected in period', value: (k, m) => m(k.expectedMinor), score: (k) => k.expectedMinor },
  { label: 'Projects confirmed', value: (k) => String(k.wonCount), score: (k) => k.wonCount },
  { label: 'Confirmation rate', value: (k) => pct(k.winRate), score: (k) => k.winRate },
  { label: 'Collection rate', value: (k) => pct(k.collectionRate), score: (k) => k.collectionRate },
  { label: 'Avg deal', value: (k, m) => (k.avgDealMinor === null ? '—' : m(k.avgDealMinor)), score: (k) => k.avgDealMinor },
  {
    label: 'Avg days to pay',
    value: (k) => (k.avgDaysToPay === null ? '—' : `${k.avgDaysToPay} days`),
    score: (k) => k.avgDaysToPay,
    lowerIsBetter: true,
  },
  { label: 'Extra work', value: (k, m) => m(k.upsellMinor), score: (k) => k.upsellMinor },
  { label: 'Outstanding', value: (k, m) => m(k.outstandingMinor), score: (k) => k.outstandingMinor, lowerIsBetter: true },
  { label: 'Overdue', value: (k, m) => m(k.overdueMinor), score: (k) => k.overdueMinor, lowerIsBetter: true },
  { label: 'Not yet confirmed', value: (k, m) => m(k.pipelineMinor), score: (k) => k.pipelineMinor },
];

/** Which side did better on a row: 'a', 'b', or null for a tie / missing value. */
function better(row: Row, a: Kpis, b: Kpis): 'a' | 'b' | null {
  const x = row.score(a);
  const y = row.score(b);
  if (x === null || y === null || x === y) return null;
  return x > y !== !!row.lowerIsBetter ? 'a' : 'b';
}

/** CEO view (D-019): two project managers side by side for one period. Choices live in the address. */
export function ComparePage() {
  const [params, setParams] = useSearchParams();
  const { owners } = useOwners();
  const asked = params.get('period');
  const period: Period = isPeriod(asked) ? asked : 'THIS_QUARTER';
  // Unknown ids in the address (an old link, a removed person) fall back to the first two project managers.
  const known = (id: string | null) => (id && owners.some((o) => o.id === id) ? id : null);
  const a = known(params.get('a')) ?? owners[0]?.id ?? '';
  const b = known(params.get('b')) ?? owners.find((o) => o.id !== a)?.id ?? '';
  const set = (key: 'a' | 'b' | 'period', value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('a', a);
        next.set('b', b);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );
  // Wait for the people list so a fallback never asks for the whole team by mistake.
  const left = useDashboard(period, a, !!a);
  const right = useDashboard(period, b, !!b);
  const nameOf = (id: string) => owners.find((o) => o.id === id)?.name ?? '…';

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/" className="text-sm text-text-muted hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">Compare project managers</h1>
        </div>
        <PeriodPicker value={period} onChange={(p) => set('period', p)} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-surface p-4 shadow-card">
        <FilterSelect label="First project manager" value={a} onChange={(v) => set('a', v)}>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </FilterSelect>
        <span className="pb-2.5 text-sm text-text-muted">vs</span>
        <FilterSelect label="Second project manager" value={b} onChange={(v) => set('b', v)}>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </FilterSelect>
      </div>

      {left.data && <CurrencyNote count={left.data.otherCurrencyProjects} noun="project" currency={left.data.currency} />}
      {!left.data || !right.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Body a={{ name: nameOf(a), data: left.data }} b={{ name: nameOf(b), data: right.data }} />
      )}
    </section>
  );
}

type Side = { name: string; data: Dashboard };

function Body({ a, b }: { a: Side; b: Side }) {
  const money = (m: number) => formatApiMoney(m, a.data.currency);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <Panel title="Key figures" subtitle="Green marks the better figure" className="lg:col-span-5">
        <Table aria-label="Comparison" className="text-sm">
          <THead>
            <TR>
              <TH />
              <TH className="text-right">{a.name}</TH>
              <TH className="text-right">{b.name}</TH>
            </TR>
          </THead>
          <TBody>
            {ROWS.map((row) => {
              const win = better(row, a.data.kpis, b.data.kpis);
              const cell = (side: 'a' | 'b') => `text-right tabular-nums ${win === side ? 'font-bold text-primary' : ''}`;
              return (
                <TR key={row.label}>
                  <TD className="text-text-muted">{row.label}</TD>
                  <TD className={cell('a')}>{row.value(a.data.kpis, money)}</TD>
                  <TD className={cell('b')}>{row.value(b.data.kpis, money)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Panel>
      <Panel title="Monthly collected" subtitle="Last 12 months" className="lg:col-span-7">
        <PairedBars a={a} b={b} money={money} />
      </Panel>
    </div>
  );
}

/** One pair of bars per month: first person solid, second hatched. */
function PairedBars({ a, b, money }: { a: Side; b: Side; money: (m: number) => string }) {
  const months = a.data.monthly.map((m, i) => ({ month: m.month, x: m.collectedMinor, y: b.data.monthly[i]?.collectedMinor ?? 0 }));
  const max = Math.max(1, ...months.flatMap((m) => [m.x, m.y]));
  return (
    <div>
      <div role="img" aria-label={`Monthly collected: ${a.name} vs ${b.name}`} className="flex h-56 items-end gap-2">
        {months.map((m, i) => (
          <div
            key={m.month}
            title={`${monthLabel(m.month)}: ${a.name} ${money(m.x)}, ${b.name} ${money(m.y)}`}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <motion.span
                className="w-full max-w-4 rounded-full bg-primary"
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(2, (m.x / max) * 100)}%` }}
                transition={{ delay: i * 0.03, duration: 0.5 }}
              />
              <motion.span
                className="hatch w-full max-w-4 rounded-full bg-accent"
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(2, (m.y / max) * 100)}%` }}
                transition={{ delay: i * 0.03, duration: 0.5 }}
              />
            </div>
            <span className="text-[10px] text-text-muted">{monthLabel(m.month)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 flex gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-primary" />
          {a.name}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="hatch size-2.5 rounded-full bg-accent" />
          {b.name}
        </span>
      </p>
    </div>
  );
}
