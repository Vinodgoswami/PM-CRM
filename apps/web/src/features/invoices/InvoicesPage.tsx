import { type InvoiceItem, type InvoicesResponse, invoicesResponseSchema } from '@salescrm/schemas';
import { Button, EmptyState, Skeleton } from '@salescrm/ui';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Pencil } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { formatApiMoney } from '../../lib/money';
import { useMarkPaidFlow } from '../payments/useMarkPaidFlow';
import { CurrencyNote } from '../dashboard/CurrencyNote';
import { useClientOptions, useOwners } from '../filters/api';
import { FilterSelect } from '../filters/FilterSelect';
import { OWNER } from '../../lib/labels';
import { MilestoneStatusBadge } from '../payments/MilestoneStatusBadge';

const GROUP_LABEL: Record<InvoicesResponse['groups'][number]['key'], string> = {
  OVERDUE: 'Overdue',
  THIS_WEEK: 'This week',
  THIS_MONTH: 'Later this month',
  NEXT_MONTH: 'Next month',
  LATER: 'Later',
  UNSCHEDULED: 'No due date',
};

const when = (days: number | null) =>
  days === null
    ? 'No date'
    : days < 0
      ? `${-days} day${days === -1 ? '' : 's'} late`
      : days === 0
        ? 'Due today'
        : `in ${days} day${days === 1 ? '' : 's'}`;

export function InvoicesPage() {
  const clients = useClientOptions();
  const { enabled: showOwners, owners } = useOwners();
  const [clientId, setClientId] = useState('');
  const [owner, setOwner] = useState('');
  const search = new URLSearchParams({ ...(clientId ? { clientId } : {}), ...(owner ? { ownerId: owner } : {}) }).toString();
  const { data, isPending, isError } = useQuery({
    queryKey: ['invoices', search],
    queryFn: () => apiFetch(`/invoices${search ? `?${search}` : ''}`, { schema: invoicesResponseSchema }),
  });
  const pay = useMarkPaidFlow();
  const grandTotal = data?.groups.reduce((s, g) => s + g.totalMinor, 0) ?? 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Upcoming Invoices</h1>
          <p className="text-text-muted">
            {data ? `${formatApiMoney(grandTotal, data.currency)} still to collect` : 'Everything still to collect, by due date'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FilterSelect label="Client" value={clientId} onChange={setClientId}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FilterSelect>
          {showOwners && (
            <FilterSelect label={OWNER} value={owner} onChange={setOwner}>
              <option value="">Everyone</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </FilterSelect>
          )}
        </div>
      </div>

      {data && <CurrencyNote count={data.otherCurrencyItems} noun="milestone" currency={data.currency} />}
      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <EmptyState title="Could not load invoices" />
      ) : data.groups.length === 0 ? (
        <EmptyState title="Nothing to collect" description="Every milestone of confirmed work is paid." />
      ) : (
        data.groups.map((g, gi) => (
          <motion.section
            key={g.key}
            aria-label={`${GROUP_LABEL[g.key]} — ${g.count}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: gi * 0.05 }}
            className={`overflow-hidden rounded-lg bg-surface shadow-card ${g.key === 'OVERDUE' ? 'ring-1 ring-danger/30' : ''}`}
          >
            <header className={`flex items-center justify-between px-5 py-3 ${g.key === 'OVERDUE' ? 'bg-danger/10' : 'bg-accent/50'}`}>
              <h2 className={`font-semibold ${g.key === 'OVERDUE' ? 'text-danger' : ''}`}>
                {GROUP_LABEL[g.key]} <span className="font-normal text-text-muted">· {g.count}</span>
              </h2>
              <span className="font-bold tabular-nums">{formatApiMoney(g.totalMinor, data.currency)}</span>
            </header>
            <ul className="divide-y divide-border">
              {g.items.map((i) => (
                <Row
                  key={i.milestoneId}
                  item={i}
                  base={data.currency}
                  onPay={() =>
                    pay.start({
                      milestoneId: i.milestoneId,
                      number: i.number,
                      title: i.title,
                      invoiceId: i.invoiceId,
                      balanceMinor: i.balanceMinor,
                      currency: i.currency,
                    })
                  }
                />
              ))}
            </ul>
          </motion.section>
        ))
      )}
      {pay.dialog}
    </section>
  );
}

function Row({ item, base, onPay }: { item: InvoiceItem; base: string; onPay: () => void }) {
  return (
    <li className="grid items-center gap-2 px-5 py-3 sm:grid-cols-[1fr_auto_auto_auto]">
      <div className="min-w-0">
        <Link to={`/projects/${item.project.id}`} className="font-medium hover:underline">
          M{item.number} {item.title}
        </Link>
        <p className="truncate text-sm text-text-muted">
          {item.client.name} · {item.project.code} {item.project.name} · {item.owner.name}
        </p>
      </div>
      <div className="text-sm">
        <p>{formatDate(item.dueDate)}</p>
        <p className={item.daysFromToday !== null && item.daysFromToday < 0 ? 'text-danger' : 'text-text-muted'}>
          {when(item.daysFromToday)}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <MilestoneStatusBadge status={item.status} />
        <span className="text-right">
          <span className="block font-semibold tabular-nums">{formatApiMoney(item.balanceMinor, item.currency)}</span>
          {item.currency !== base && item.baseBalanceMinor !== null && (
            <span className="block text-xs text-text-muted tabular-nums">≈ {formatApiMoney(item.baseBalanceMinor, base)}</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1 sm:justify-end">
        {item.canEdit && (
          <Button asChild size="icon" variant="ghost" title="Edit milestone">
            <Link
              to={`/projects/${item.project.id}?tab=milestones&edit=${item.milestoneId}`}
              aria-label={`Edit M${item.number} ${item.title}`}
            >
              <Pencil className="size-4" />
            </Link>
          </Button>
        )}
        {item.canPay && (
          <Button size="sm" aria-label={`Mark M${item.number} ${item.title} as paid`} onClick={onPay}>
            <BadgeCheck className="size-4" /> Mark as paid
          </Button>
        )}
      </div>
    </li>
  );
}
