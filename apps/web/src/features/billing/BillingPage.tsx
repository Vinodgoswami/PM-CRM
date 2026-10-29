import { type PeriodKey, PERIODS, periodRange, todayIn } from '@salescrm/core';
import { Button, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatDate } from '../../lib/dates';
import { formatApiMoney } from '../../lib/money';
import { CurrencyNote } from '../dashboard/CurrencyNote';
import { usePayments } from '../payments/api';
import { useSettings } from '../settings/api';

const PAGE_SIZE = 50;

export function BillingPage() {
  const settings = useSettings().data;
  const [period, setPeriod] = useState<PeriodKey>('THIS_FY');
  const [page, setPage] = useState(1);
  const today = todayIn(settings?.timezone ?? 'Asia/Kolkata', new Date());
  const range = periodRange(period, today, settings?.fyStartMonth ?? 4);
  const filters = new URLSearchParams({ ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) });
  const search = new URLSearchParams({ ...Object.fromEntries(filters), page: String(page), pageSize: String(PAGE_SIZE) }).toString();
  const { data, isPending, isError } = usePayments(search, !!settings);
  const currency = settings?.baseCurrency ?? 'INR';
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Completed Billing</h1>
          <p className="text-text-muted">Every payment received, newest first</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Period"
            className="h-10 rounded-full border border-border bg-surface px-4 text-sm"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as PeriodKey);
              setPage(1);
            }}
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <Button asChild variant="outline">
            <a href={`/api/v1/exports/csv/billing?${filters.toString()}`}>
              <Download className="size-4" /> Export CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="rounded-lg bg-primary p-6 text-primary-contrast shadow-card">
        <p className="text-sm text-white/80">Collected {range.from ? `${formatDate(range.from)} – ${formatDate(range.to)}` : 'all time'}</p>
        <p className="mt-1 text-4xl font-extrabold tabular-nums">{data ? formatApiMoney(data.totalMinor, currency) : '—'}</p>
        <p className="mt-1 text-sm text-white/80">
          {data ? `${data.total} payment${data.total === 1 ? '' : 's'} (reversals subtract)` : ''}
        </p>
      </div>

      {data && <CurrencyNote count={data.otherCurrencyPayments} noun="payment" currency={currency} />}
      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <EmptyState title="Could not load payments" />
      ) : data.items.length === 0 ? (
        <EmptyState title="No payments in this period" />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Client</TH>
                <TH>Project</TH>
                <TH>Milestone</TH>
                <TH>Invoice ID</TH>
                <TH className="text-right">Amount</TH>
                <TH>Recorded by</TH>
              </TR>
            </THead>
            <TBody>
              {data.items.map((p) => {
                const reversal = p.reversesPaymentId !== null;
                return (
                  <TR key={p.id} className={reversal ? 'text-danger' : undefined}>
                    <TD>{formatDate(p.paymentDate)}</TD>
                    <TD>{p.client.name}</TD>
                    <TD>
                      <Link to={`/projects/${p.project.id}`} className="hover:underline">
                        {p.project.code} {p.project.name}
                      </Link>
                    </TD>
                    <TD>
                      {p.milestoneLabel}
                      {reversal && <span className="ml-2 text-xs">Reversal{p.note ? ` · ${p.note}` : ''}</span>}
                    </TD>
                    <TD>{p.invoiceId ?? '—'}</TD>
                    <TD className="text-right font-medium tabular-nums">{formatApiMoney(p.amountMinor, p.project.currency)}</TD>
                    <TD>{p.createdBy.name}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
                Previous
              </Button>
              <span>
                Page {page} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
