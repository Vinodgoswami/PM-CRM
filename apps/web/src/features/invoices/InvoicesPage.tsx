import { can } from '@salescrm/auth/permissions';
import { type InvoiceItem, type InvoicesResponse, invoicesResponseSchema } from '@salescrm/schemas';
import { Button, EmptyState, Skeleton } from '@salescrm/ui';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { formatApiMoney } from '../../lib/money';
import { useSession } from '../auth/api';
import { MarkPaidDialog, type MarkPaidTarget } from '../payments/MarkPaidDialog';
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
  const { data: session } = useSession();
  const [owner, setOwner] = useState('');
  const search = new URLSearchParams(owner ? { ownerId: owner } : {}).toString();
  const { data, isPending, isError } = useQuery({
    queryKey: ['invoices', search],
    queryFn: () => apiFetch(`/invoices${search ? `?${search}` : ''}`, { schema: invoicesResponseSchema }),
  });
  const [paying, setPaying] = useState<MarkPaidTarget | null>(null);
  const showOwnerFilter = !!session && can(session.user, 'dashboard.company');
  const owners = data ? [...new Map(data.groups.flatMap((g) => g.items.map((i) => [i.owner.id, i.owner.name] as const))).entries()] : [];
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
        {showOwnerFilter && (
          <select
            aria-label="Owner"
            className="h-10 rounded-full border border-border bg-surface px-4 text-sm"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">All owners</option>
            {owners.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <EmptyState title="Could not load invoices" />
      ) : data.groups.length === 0 ? (
        <EmptyState title="Nothing to collect" description="Every milestone of booked work is paid." />
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
                  onPay={() =>
                    setPaying({
                      milestoneId: i.milestoneId,
                      number: i.number,
                      title: i.title,
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
      {paying && <MarkPaidDialog target={paying} onClose={() => setPaying(null)} />}
    </section>
  );
}

function Row({ item, onPay }: { item: InvoiceItem; onPay: () => void }) {
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
        <span className="font-semibold tabular-nums">{formatApiMoney(item.balanceMinor, item.currency)}</span>
      </div>
      <div className="sm:text-right">
        {item.canPay && (
          <Button size="sm" aria-label={`Mark M${item.number} ${item.title} as paid`} onClick={onPay}>
            <BadgeCheck className="size-4" /> Mark as paid
          </Button>
        )}
      </div>
    </li>
  );
}
