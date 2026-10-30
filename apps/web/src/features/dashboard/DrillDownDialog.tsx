import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, EmptyState, Skeleton } from '@salescrm/ui';
import { useQueries } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { formatDate } from '../../lib/dates';
import { formatApiMoney } from '../../lib/money';
import { paymentsQuery } from '../payments/api';
import { projectsQuery } from '../projects/api';

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
            <Payments search={new URLSearchParams({ from, to, ...owner, pageSize: String(PAGE) }).toString()} />
          ) : (
            <Won search={new URLSearchParams({ wonFrom: from, wonTo: to, ...owner, pageSize: String(PAGE) }).toString()} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PAGE = 100;

/** Loads page after page on "Load more" so a busy month is never cut off. */
function usePaged<T>(
  search: string,
  query: (s: string) => { queryKey: readonly unknown[]; queryFn: () => Promise<{ items: T[]; total: number }> },
) {
  const [pages, setPages] = useState(1);
  const results = useQueries({
    queries: Array.from({ length: pages }, (_, i) => query(`${search}&page=${i + 1}`)),
  });
  const items = results.flatMap((r) => r.data?.items ?? []);
  return {
    isPending: results[0]!.isPending,
    loadingMore: results.some((r) => r.isPending),
    items,
    total: results[0]!.data?.total ?? 0,
    more: () => setPages((n) => n + 1),
  };
}

function More({ shown, total, loading, onMore }: { shown: number; total: number; loading: boolean; onMore: () => void }) {
  if (total <= PAGE) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm text-text-muted">
      <span>
        Showing {shown} of {total}
      </span>
      {shown < total && (
        <Button variant="outline" size="sm" disabled={loading} onClick={onMore}>
          Load more
        </Button>
      )}
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border">{children}</ul>;
}

function Payments({ search }: { search: string }) {
  const { isPending, loadingMore, items, total, more } = usePaged(search, paymentsQuery);
  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (items.length === 0) return <EmptyState title="No payments this month" />;
  return (
    <>
      <List>
        {items.map((p) => (
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
      </List>
      <More shown={items.length} total={total} loading={loadingMore} onMore={more} />
    </>
  );
}

function Won({ search }: { search: string }) {
  const { isPending, loadingMore, items, total, more } = usePaged(search, projectsQuery);
  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (items.length === 0) return <EmptyState title="No projects won this month" />;
  return (
    <>
      <List>
        {items.map((p) => (
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
      </List>
      <More shown={items.length} total={total} loading={loadingMore} onMore={more} />
    </>
  );
}
