import { can } from '@salescrm/auth/permissions';
import { type Dashboard } from '@salescrm/schemas';
import { Button, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { ArrowUpRight, CalendarClock, Download, FileDown, Info, Plus, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatDate } from '../../lib/dates';
import { formatApiMoney } from '../../lib/money';
import { useSession } from '../auth/api';
import { useOwners } from '../filters/api';
import { HatchedBars, monthLabel, Sparkline, Wave } from './charts';
import { CurrencyNote } from './CurrencyNote';
import { isPeriod, type Period, PERIODS, PeriodPicker, useDashboard } from './data';
import { dashboardCsv } from './csv';
import { DrillDownDialog } from './DrillDownDialog';
import { DueCalendar } from './DueCalendar';
import { ClientBars, Funnel, QuarterBars, SeriesToggle, UpsellDonut, YoyLine } from './MoreCharts';
import { Panel } from './Panel';
import { TeamTable } from './TeamTable';
import { APP_NAME } from '../../lib/brand';
import { downloadCsv } from '../../lib/download';
import { OWNER } from '../../lib/labels';
import { UpcomingBookings } from './UpcomingBookings';
import { OptionSelect } from '../../components/OptionSelect';
import { AdminCounts } from '../admin/AdminOverviewPage';
import { UpcomingSummary } from './UpcomingSummary';
import { useCountUp } from './useCountUp';

const pct = (current: number, previous: number | undefined) =>
  previous === undefined || previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

function Delta({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return null;
  const good = inverse ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${good ? 'bg-white/90 text-primary' : 'bg-danger/15 text-danger'}`}
    >
      <Icon className="size-3" aria-hidden />
      {value >= 0 ? '+' : ''}
      {value}%
    </span>
  );
}

const CornerLink = ({ to, label }: { to: string; label: string }) => (
  <Link
    to={to}
    aria-label={label}
    className="grid size-8 place-items-center rounded-full border border-border text-text-muted hover:bg-accent hover:text-text"
  >
    <ArrowUpRight className="size-4" />
  </Link>
);

export function DashboardPage() {
  const { data: session } = useSession();
  // Filters live in the address (?period=&ownerId=) so a view can be bookmarked or shared.
  const [params, setParams] = useSearchParams();
  const asked = params.get('period');
  // Project managers report quarter by quarter, so the dashboard opens on this quarter.
  const period: Period = isPeriod(asked) ? asked : 'THIS_QUARTER';
  const ownerId = params.get('ownerId') ?? '';
  const setFilter = (key: 'period' | 'ownerId', value: string, fallback: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const setPeriod = (p: Period) => setFilter('period', p, 'THIS_QUARTER');
  const setOwnerId = (id: string) => setFilter('ownerId', id, '');
  const { data, isPending, isError, refetch } = useDashboard(period, ownerId);
  const firstName = session?.user.name.split(' ')[0] ?? '';
  const canCreate = !!session && can(session.user, 'projects.write');
  const { enabled: showOwners, owners } = useOwners();

  return (
    <section className="space-y-6">
      <p data-testid="print-header" className="hidden text-sm text-text-muted print:block">
        {APP_NAME} dashboard · {PERIODS.find((p) => p.key === period)?.label}
        {ownerId ? ` · ${owners.find((o) => o.id === ownerId)?.name ?? ''}` : ''} · generated {new Date().toLocaleString('en-IN')}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Welcome back, <span className="font-medium text-text-muted">{firstName}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <PeriodPicker value={period} onChange={setPeriod} />
          {showOwners && (
            <OptionSelect
              aria-label={OWNER}
              className="h-10 rounded-full border border-border bg-surface px-4 text-sm"
              value={ownerId}
              onValueChange={(v) => setOwnerId(v)}
            >
              <option value="">Whole team</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </OptionSelect>
          )}
          {showOwners && (
            <Button asChild variant="outline">
              <Link to="/compare">
                <Users className="size-4" /> Compare
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!data}
            onClick={() =>
              data && downloadCsv(`dashboard-${data.period.from ?? 'all'}-${data.period.to ?? 'time'}.csv`, dashboardCsv(data))
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!data}>
            <FileDown className="size-4" /> Export PDF
          </Button>
          {canCreate && (
            <Button asChild variant="outline">
              <Link to="/projects/new">
                <Plus className="size-4" /> New project
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isPending ? (
        <div className="grid gap-5 lg:grid-cols-12" aria-busy="true">
          <Skeleton className="h-72 lg:col-span-4" />
          <Skeleton className="h-72 lg:col-span-5" />
          <Skeleton className="h-72 lg:col-span-3" />
        </div>
      ) : isError ? (
        <EmptyState
          title="Could not load the dashboard"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <DashboardBody data={data} ownerId={ownerId} />
      )}
    </section>
  );
}

function DashboardBody({ data, ownerId }: { data: Dashboard; ownerId: string }) {
  const k = data.kpis;
  const money = (m: number) => formatApiMoney(m, data.currency);
  const collected = useCountUp(k.collectedMinor);
  const outstanding = useCountUp(k.outstandingMinor);
  const [series, setSeries] = useState<'collected' | 'booked'>('collected');
  const [drill, setDrill] = useState<string | null>(null);
  // D-022: the Admin sees every figure but no client or project names, and cannot open the lists behind them.
  const anon = data.anonymous;
  const { data: session } = useSession();
  const showCounts = !!session && can(session.user, 'admin.overview');
  const [qSeries, setQSeries] = useState<'booked' | 'collected'>('booked');
  const bars = data.monthly.map((m) => ({
    key: m.month,
    label: monthLabel(m.month),
    value: series === 'collected' ? m.collectedMinor : m.bookedMinor,
  }));
  const agingRows = [
    { label: '1–30 days', value: data.aging.d1_30 },
    { label: '31–60 days', value: data.aging.d31_60 },
    { label: '61–90 days', value: data.aging.d61_90 },
    { label: '90+ days', value: data.aging.d90plus },
  ];
  const agingMax = Math.max(1, ...agingRows.map((r) => r.value));
  const periodText = data.period.from ? `${formatDate(data.period.from)} – ${formatDate(data.period.to)}` : 'All time';

  const agingPanel = (
    <Panel title="Overdue by age" subtitle="Unpaid balance, days past due" className="lg:col-span-5">
      <ul className="space-y-3">
        {agingRows.map((r, i) => (
          <li key={r.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">{r.label}</span>
              <span className="font-semibold tabular-nums">{money(r.value)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-background">
              <motion.div
                className={`h-full rounded-full ${i === 3 ? 'bg-danger' : 'bg-primary'}`}
                initial={{ width: 0 }}
                animate={{ width: `${(r.value / agingMax) * 100}%` }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.6 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );

  return (
    <div className="space-y-5">
      {showCounts && <AdminCounts />}
      <CurrencyNote count={data.otherCurrencyProjects} noun="project" currency={data.currency} />
      {data.conversion && (
        // D-036: this viewer sees the company totals in their own currency.
        <p role="note" className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm">
          <Info className="size-4 shrink-0 text-primary" aria-hidden />
          Shown in {data.conversion.to}. Projects in {data.conversion.to} use their own amounts; the rest are converted at each project’s
          rate from the day it was created. Change it in your profile.
        </p>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <motion.section
          aria-label="Collected"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative min-w-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-strong p-6 text-primary-contrast shadow-card lg:col-span-4"
        >
          <div aria-hidden className="absolute -top-16 -right-12 size-56 rounded-full bg-white/10" />
          <div aria-hidden className="absolute -bottom-20 left-10 size-44 rounded-full bg-white/5" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-white/80">Collected</p>
                <p className="text-xs text-white/60">{periodText}</p>
              </div>
              <Delta value={pct(k.collectedMinor, data.previous?.collectedMinor)} />
            </div>
            <p className="text-4xl font-extrabold tracking-tight tabular-nums">{money(collected)}</p>
            <div className="flex items-end justify-between text-sm">
              <div>
                <p className="text-white/70">Contracted</p>
                <p className="font-bold">{money(k.bookedMinor)}</p>
              </div>
              <div className="text-center">
                <p className="text-white/70">Projects confirmed</p>
                <p className="font-bold">{k.wonCount}</p>
              </div>
              <div className="text-right" title="Confirmed ÷ (confirmed + cancelled) in this period">
                <p className="text-white/70">Confirmation rate</p>
                <p className="font-bold">{k.winRate === null ? '—' : `${Math.round(k.winRate * 100)}%`}</p>
              </div>
            </div>
          </div>
        </motion.section>

        <Panel
          title="Monthly performance"
          subtitle="Last 12 months"
          className="lg:col-span-5"
          action={
            <div role="radiogroup" aria-label="Series" className="flex rounded-full bg-background p-1 text-xs print:hidden">
              {(['collected', 'booked'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={series === s}
                  onClick={() => setSeries(s)}
                  className={`rounded-full px-3 py-1 capitalize ${series === s ? 'bg-primary font-semibold text-primary-contrast' : 'text-text-muted'}`}
                >
                  {s === 'booked' ? 'contracted' : s}
                </button>
              ))}
            </div>
          }
        >
          <HatchedBars
            key={series}
            data={bars}
            currency={data.currency}
            highlightIndex={bars.length - 1}
            label={`Monthly ${series}`}
            onSelect={anon ? undefined : setDrill}
          />
          {drill && <DrillDownDialog month={drill} series={series} ownerId={ownerId} onClose={() => setDrill(null)} />}
        </Panel>

        <Panel
          title="Outstanding"
          subtitle="Due and unpaid today"
          className="flex flex-col lg:col-span-3"
          action={<CornerLink to="/invoices" label="Open upcoming invoices" />}
        >
          <p className="text-3xl font-extrabold tracking-tight tabular-nums">{money(outstanding)}</p>
          <p className="mt-1 text-sm">
            <span className="font-semibold text-danger">{k.overdueCount} overdue</span>
            <span className="text-text-muted"> · {money(k.overdueMinor)}</span>
          </p>
          <div className="mt-auto pt-4">
            <Wave values={data.forecast.map((f) => f.scheduledMinor)} />
            <p className="text-xs text-text-muted">Cash due over the next 6 months</p>
          </div>
        </Panel>
      </div>

      <BookingSplit totalMinor={k.bookedMinor} upsellMinor={k.upsellMinor} money={money} />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi
          label="Total booking"
          value={money(k.bookedMinor)}
          delta={pct(k.bookedMinor, data.previous?.bookedMinor)}
          spark={data.monthly.map((x) => x.bookedMinor)}
        />
        <Kpi label="Expected in period" value={money(k.expectedMinor)} spark={data.monthly.map((x) => x.expectedMinor)} />
        <Kpi label="Due next 30 days" value={money(k.dueNext30Minor)} />
        <Kpi label="Not yet confirmed" value={money(k.pipelineMinor)} hint="Enquiries and quotes" />
        <Kpi
          label="Upsell share"
          value={k.bookedMinor > 0 ? `${Math.round((k.upsellMinor * 100) / k.bookedMinor)}%` : '—'}
          hint={money(k.upsellMinor)}
        />
        <Kpi label="Collection rate" value={k.collectionRate === null ? '—' : `${Math.round(k.collectionRate * 100)}%`} />
        <Kpi label="Avg deal" value={k.avgDealMinor === null ? '—' : money(k.avgDealMinor)} />
        <Kpi
          label="Avg days to pay"
          value={k.avgDaysToPay === null ? '—' : `${k.avgDaysToPay} days`}
          hint={k.avgDaysToPay !== null && k.avgDaysToPay < 0 ? 'Paid early on average' : 'After the due date'}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Panel
          title="Quarter comparison"
          subtitle="This financial year against last"
          className="lg:col-span-6"
          action={<SeriesToggle label="Quarter series" value={qSeries} options={['booked', 'collected'] as const} onChange={setQSeries} />}
        >
          <QuarterBars data={data.quarters} series={qSeries} money={money} />
        </Panel>
        <Panel title="Year over year" subtitle="Cumulative money collected" className="lg:col-span-6">
          <YoyLine data={data.yearOverYear} money={money} />
        </Panel>
      </div>

      {anon ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <UpcomingSummary items={data.upcomingSummary} money={money} />
          {agingPanel}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel
              title="Upcoming dues"
              subtitle="Next 30 days"
              className="lg:col-span-7"
              action={<CornerLink to="/invoices" label="All upcoming invoices" />}
            >
              {data.upcoming.length === 0 ? (
                <p className="text-sm text-text-muted">Nothing due in the next 30 days.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.upcoming.map((u) => (
                    <li key={u.milestoneId} className="flex items-center gap-3 py-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-primary">
                        <CalendarClock className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/projects/${u.project.id}`} className="block truncate font-medium hover:underline">
                          M{u.number} {u.title}
                        </Link>
                        <p className="truncate text-xs text-text-muted">
                          {u.client.name} · {u.project.code}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{money(u.balanceMinor)}</p>
                        <p className="text-xs text-text-muted">{formatDate(u.dueDate)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Due-date calendar" subtitle="Unpaid balances by due day" className="lg:col-span-5">
              <DueCalendar ownerId={ownerId} currency={data.currency} />
            </Panel>
          </div>

          <UpcomingBookings items={data.upcomingBookings} money={money} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel
              title="Overdue milestones"
              subtitle="Most days overdue first"
              className="lg:col-span-7"
              action={<CornerLink to="/invoices" label="Open upcoming invoices" />}
            >
              {data.overdue.length === 0 ? (
                <p className="text-sm text-text-muted">Nothing overdue. </p>
              ) : (
                <Table className="text-sm">
                  <THead>
                    <TR>
                      <TH>Milestone</TH>
                      <TH>{OWNER}</TH>
                      <TH className="text-right">Overdue</TH>
                      <TH className="text-right">Balance</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.overdue.map((o) => (
                      <TR key={o.milestoneId}>
                        <TD>
                          <Link to={`/projects/${o.project.id}`} className="font-medium hover:underline">
                            M{o.number} {o.title}
                          </Link>
                          <p className="text-xs text-text-muted">
                            {o.client.name} · {o.project.code}
                          </p>
                        </TD>
                        <TD>{o.owner.name}</TD>
                        <TD className="text-right font-semibold text-danger tabular-nums">{o.daysOverdue} days</TD>
                        <TD className="text-right font-semibold tabular-nums">{money(o.balanceMinor)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Panel>

            {agingPanel}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel
              title="Recent payments"
              subtitle="Latest money in"
              className="lg:col-span-7"
              action={<CornerLink to="/billing" label="Completed billing" />}
            >
              {data.recentPayments.length === 0 ? (
                <p className="text-sm text-text-muted">No payments yet.</p>
              ) : (
                <Table className="text-sm">
                  <THead>
                    <TR>
                      <TH>Client</TH>
                      <TH>Date</TH>
                      <TH>Invoice</TH>
                      <TH className="text-right">Amount</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.recentPayments.map((p) => (
                      <TR key={p.id}>
                        <TD>
                          <p className="font-medium">{p.client.name}</p>
                          <p className="text-xs text-text-muted">{p.project.code}</p>
                        </TD>
                        <TD>{formatDate(p.paymentDate)}</TD>
                        <TD>
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden className={`size-1.5 rounded-full ${p.amountMinor < 0 ? 'bg-danger' : 'bg-success'}`} />
                            {p.invoiceId ?? '—'}
                          </span>
                        </TD>
                        <TD className={`text-right font-semibold tabular-nums ${p.amountMinor < 0 ? 'text-danger' : ''}`}>
                          {money(p.amountMinor)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Panel>

            <Panel title="Revenue by client" subtitle="Collected in the period (track = contracted)" className="lg:col-span-5">
              <ClientBars data={data.clientRevenue} money={money} />
            </Panel>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Panel title="Projects by stage" subtitle="Current stage · count and value" className="lg:col-span-7">
          <Funnel data={data.funnel} money={money} />
        </Panel>
        <Panel title="New vs extra work" subtitle="Contracted in the period" className="lg:col-span-5">
          <UpsellDonut bookedMinor={k.bookedMinor} upsellMinor={k.upsellMinor} money={money} />
        </Panel>
      </div>

      {data.team && <TeamTable team={data.team} currency={data.currency} />}
    </div>
  );
}

/** D-028: total booking = initial booking (first phase of each project) + upsell (later phases and extra work). */
function BookingSplit({ totalMinor, upsellMinor, money }: { totalMinor: number; upsellMinor: number; money: (m: number) => string }) {
  const initialMinor = totalMinor - upsellMinor;
  const share = (m: number) => (totalMinor > 0 ? `${(m * 100) / totalMinor}%` : '0%');
  const parts = [
    { label: 'Initial booking', value: initialMinor, dot: 'bg-primary' },
    { label: 'Upsell', value: upsellMinor, dot: 'bg-warning' },
  ];
  return (
    <section aria-label="Booking split" className="rounded-xl bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        {parts.map((p, i) => (
          <div key={p.label} className="flex items-end gap-8">
            <div>
              <p className="flex items-center gap-1.5 text-xs text-text-muted">
                <span className={`size-2 rounded-full ${p.dot}`} aria-hidden />
                {p.label}
              </p>
              <p className="text-lg font-bold tabular-nums">{money(p.value)}</p>
            </div>
            <span className="pb-1 text-lg text-text-muted" aria-hidden>
              {i === 0 ? '+' : '='}
            </span>
          </div>
        ))}
        <div>
          <p className="text-xs text-text-muted">Total booking</p>
          <p className="text-lg font-extrabold tabular-nums">{money(totalMinor)}</p>
        </div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-accent" aria-hidden>
        <span className="bg-primary" style={{ width: share(initialMinor) }} />
        <span className="bg-warning" style={{ width: share(upsellMinor) }} />
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  delta,
  hint,
  spark,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  /** Last 12 months, oldest first. */
  spark?: number[];
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="min-w-0 rounded-xl bg-surface p-4 shadow-card">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-extrabold tabular-nums">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
        {delta !== undefined && delta !== null && (
          <span className={`rounded-full px-2 py-0.5 font-semibold ${delta >= 0 ? 'bg-accent text-primary' : 'bg-danger/10 text-danger'}`}>
            {delta >= 0 ? '+' : ''}
            {delta}%
          </span>
        )}
        {hint && <span className="truncate">{hint}</span>}
        {spark && (
          <span className="ml-auto">
            <Sparkline values={spark} label={`${label}, last 12 months`} />
          </span>
        )}
      </div>
    </motion.div>
  );
}
