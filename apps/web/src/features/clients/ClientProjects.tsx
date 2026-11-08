import { Skeleton } from '@salescrm/ui';
import { Link } from 'react-router';
import { formatViewMoney } from '../../lib/money';
import { useProjects } from '../projects/api';
import { StatusBadge } from '../projects/StatusBadge';

/** The accordion body on the clients list: every project of one client, each a link to its page. */
export function ClientProjects({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { data, isPending, isError } = useProjects(new URLSearchParams({ clientId, pageSize: '100', sort: 'code' }).toString());
  return (
    <section aria-label={`Projects for ${clientName}`} className="space-y-2 py-1">
      {isPending ? (
        <Skeleton className="h-14 w-full" />
      ) : isError ? (
        <p className="text-sm text-danger">Could not load the projects.</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-text-muted">No projects yet.</p>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] gap-4 px-3 text-xs font-medium text-text-muted md:grid">
            <span>Project</span>
            <span className="text-right">Worth</span>
            <span className="text-right">Initial booking</span>
            <span className="text-right">Milestones paid</span>
            <span>Payment released</span>
          </div>
          <ul className="space-y-1.5">
            {data.items.map((p) => {
              const money = (m: number) => formatViewMoney(m, p.currency, p.view);
              const released = p.contractValueMinor > 0 ? Math.min(100, Math.round((p.collectedMinor / p.contractValueMinor) * 100)) : 0;
              return (
                <li key={p.id}>
                  <Link
                    to={`/projects/${p.id}`}
                    className="grid items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm transition-colors hover:border-primary/50 hover:bg-accent md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{p.name}</span>{' '}
                        <span className="text-xs text-text-muted">
                          {p.code}
                          {p.parentProjectId ? ' · extra work' : ''}
                        </span>
                      </span>
                      <StatusBadge status={p.status} />
                    </span>
                    <span className="tabular-nums md:text-right">
                      <span className="text-text-muted md:hidden">Worth </span>
                      <span className="font-medium">{money(p.contractValueMinor)}</span>
                    </span>
                    <span className="tabular-nums md:text-right">
                      <span className="text-text-muted md:hidden">Initial booking </span>
                      {money(p.expectedAmountMinor)}
                    </span>
                    <span className="tabular-nums md:text-right">
                      <span className="text-text-muted md:hidden">Milestones paid </span>
                      {p.paidMilestoneCount} / {p.milestoneCount}
                    </span>
                    <span className="space-y-1">
                      <span className="block text-xs tabular-nums">
                        <span className="font-medium text-success">{money(p.collectedMinor)}</span> of {money(p.contractValueMinor)}
                      </span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-accent" aria-hidden>
                        <span className="block h-full rounded-full bg-success" style={{ width: `${released}%` }} />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
