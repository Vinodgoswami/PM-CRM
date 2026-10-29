import { type PeriodKey, PERIODS, periodRange, todayIn } from '@salescrm/core';
import { type PaymentDto } from '@salescrm/schemas';
import { Button, EmptyState, Input, Skeleton, Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { Download, Pencil } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { formatDate } from '../../lib/dates';
import { formatApiMoney } from '../../lib/money';
import { CurrencyNote } from '../dashboard/CurrencyNote';
import { useClientOptions, useOwners } from '../filters/api';
import { FilterSelect } from '../filters/FilterSelect';
import { usePayments } from '../payments/api';
import { EditPaymentDialog } from '../payments/EditPaymentDialog';
import { useSettings } from '../settings/api';

const PAGE_SIZE = 50;
type Period = PeriodKey | 'CUSTOM';

export function BillingPage() {
  const settings = useSettings().data;
  const clients = useClientOptions();
  const { enabled: showOwners, owners } = useOwners();
  const [period, setPeriod] = useState<Period>('THIS_FY');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [clientId, setClientId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PaymentDto | null>(null);
  const fromId = useId();
  const toId = useId();

  const today = todayIn(settings?.timezone ?? 'Asia/Kolkata', new Date());
  const range =
    period === 'CUSTOM'
      ? { from: custom.from || undefined, to: custom.to || undefined }
      : periodRange(period, today, settings?.fyStartMonth ?? 4);
  // One filter set drives the list, the total and the CSV export, so they always agree.
  const filters = new URLSearchParams({
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
    ...(clientId ? { clientId } : {}),
    ...(ownerId ? { ownerId } : {}),
  });
  const search = new URLSearchParams({ ...Object.fromEntries(filters), page: String(page), pageSize: String(PAGE_SIZE) }).toString();
  const { data, isPending, isError } = usePayments(search, !!settings);
  const currency = settings?.baseCurrency ?? 'INR';
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Completed Billing</h1>
          <p className="text-text-muted">Every payment received, newest first</p>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/v1/exports/csv/billing?${filters.toString()}`}>
            <Download className="size-4" /> Export CSV
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-surface p-4 shadow-card">
        <FilterSelect label="Period" value={period} onChange={reset((v: string) => setPeriod(v as Period))}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value="CUSTOM">Custom dates</option>
        </FilterSelect>
        {period === 'CUSTOM' && (
          <>
            <label htmlFor={fromId} className="flex flex-col gap-1 text-xs text-text-muted">
              From
              <Input
                id={fromId}
                type="date"
                className="h-10 rounded-full"
                value={custom.from}
                onChange={(e) => reset(setCustom)({ ...custom, from: e.target.value })}
              />
            </label>
            <label htmlFor={toId} className="flex flex-col gap-1 text-xs text-text-muted">
              To
              <Input
                id={toId}
                type="date"
                className="h-10 rounded-full"
                value={custom.to}
                onChange={(e) => reset(setCustom)({ ...custom, to: e.target.value })}
              />
            </label>
          </>
        )}
        <FilterSelect label="Client" value={clientId} onChange={reset(setClientId)}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        {showOwners && (
          <FilterSelect label="Salesperson" value={ownerId} onChange={reset(setOwnerId)}>
            <option value="">Everyone</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </FilterSelect>
        )}
      </div>

      <div className="rounded-xl bg-gradient-to-br from-primary to-primary-strong p-6 text-primary-contrast shadow-card">
        <p className="text-sm text-white/80">
          Collected{' '}
          {range.from || range.to ? `${range.from ? formatDate(range.from) : '…'} – ${range.to ? formatDate(range.to) : '…'}` : 'all time'}
        </p>
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
        <EmptyState title="No payments match these filters" />
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
                <TH />
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
                      {p.reversedById && <span className="ml-2 text-xs text-text-muted">(reversed)</span>}
                    </TD>
                    <TD>{p.invoiceId ?? '—'}</TD>
                    <TD className="text-right font-medium tabular-nums">{formatApiMoney(p.amountMinor, p.project.currency)}</TD>
                    <TD>{p.createdBy.name}</TD>
                    <TD className="text-right">
                      {p.canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit payment ${p.invoiceId ?? p.milestoneLabel}`}
                          onClick={() => setEditing(p)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </TD>
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
      {editing && <EditPaymentDialog payment={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
