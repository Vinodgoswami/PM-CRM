import { Dialog, DialogContent, DialogDescription, DialogTitle, EmptyState, Skeleton } from '@salescrm/ui';
import { Link } from 'react-router';
import { formatDate } from '../../lib/dates';
import { formatApiMoney } from '../../lib/money';
import { usePayments } from '../payments/api';
import { useProjects } from '../projects/api';

const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return { from: `${ym}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** What is behind one monthly bar (docs/09 C1 drill-down): the payments, or the projects won. */
export function DrillDownDialog({
  month,
  series,
  ownerId,
  onClose,
}: {
  month: string;
  series: 'collected' | 'booked';
  ownerId: string;
  onClose: () => void;
}) {
  const { from, to } = monthRange(month);
  const owner: Record<string, string> = ownerId ? { ownerId } : {};
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>
          {series === 'collected' ? 'Collected' : 'Won'} in {monthName(month)}
        </DialogTitle>
        <DialogDescription>
          {series === 'collected'
            ? 'Every payment received this month.'
            : 'Projects booked this month (upsell amounts are counted in Booked too).'}
        </DialogDescription>
        <div className="mt-4 max-h-[60dvh] overflow-y-auto">
          {series === 'collected' ? (
            <Payments search={new URLSearchParams({ from, to, ...owner, pageSize: '100' }).toString()} />
          ) : (
            <Won search={new URLSearchParams({ wonFrom: from, wonTo: to, ...owner, pageSize: '100' }).toString()} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Payments({ search }: { search: string }) {
  const { data, isPending } = usePayments(search);
  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (!data || data.items.length === 0) return <EmptyState title="No payments this month" />;
  return (
    <ul className="divide-y divide-border">
      {data.items.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <Link to={`/projects/${p.project.id}`} className="font-medium hover:underline">
              {p.client.name} · {p.project.code}
            </Link>
            <p className="text-xs text-text-muted">
              {formatDate(p.paymentDate)} · {p.milestoneLabel}
              {p.invoiceId ? ` · ` : ''}
              {p.invoiceId && <span>{p.invoiceId}</span>}
            </p>
          </div>
          <span className={`font-semibold tabular-nums ${p.amountMinor < 0 ? 'text-danger' : ''}`}>
            {formatApiMoney(p.amountMinor, p.project.currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Won({ search }: { search: string }) {
  const { data, isPending } = useProjects(search);
  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (!data || data.items.length === 0) return <EmptyState title="No projects won this month" />;
  return (
    <ul className="divide-y divide-border">
      {data.items.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
              {p.code} {p.name}
            </Link>
            <p className="text-xs text-text-muted">
              {p.client.name} · won {formatDate(p.wonAt)} · {p.owner.name}
            </p>
          </div>
          <span className="font-semibold tabular-nums">{formatApiMoney(p.contractValueMinor, p.currency)}</span>
        </li>
      ))}
    </ul>
  );
}
