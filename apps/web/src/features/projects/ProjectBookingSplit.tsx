import { type ProjectDetail } from '@salescrm/schemas';
import { formatApiMoney } from '../../lib/money';

/** D-028: initial booking (this project) + upsell (extra-work amounts and later phases) = total booking. */
export function projectBooking(project: ProjectDetail) {
  const initial = project.expectedAmountMinor;
  const upsell =
    project.upsellEntries.reduce((s, u) => s + u.amountMinor, 0) + project.upsellProjects.reduce((s, u) => s + u.contractValueMinor, 0);
  return { initial, upsell, total: initial + upsell };
}

export function ProjectBookingSplit({ project }: { project: ProjectDetail }) {
  const money = (m: number) => formatApiMoney(m, project.currency);
  const { initial, upsell, total } = projectBooking(project);
  const share = (m: number) => (total > 0 ? `${(m * 100) / total}%` : '0%');
  return (
    <div aria-label="Booking split" role="region" className="space-y-3 rounded-lg border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Initial booking" value={money(initial)} dot="bg-primary" />
        <Figure label="Upsell" value={money(upsell)} dot="bg-warning" />
        <Figure label="Total booking" value={money(total)} strong />
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-accent" aria-hidden>
        <span className="bg-primary" style={{ width: share(initial) }} />
        <span className="bg-warning" style={{ width: share(upsell) }} />
      </div>
    </div>
  );
}

function Figure({ label, value, dot, strong }: { label: string; value: string; dot?: string; strong?: boolean }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        {dot && <span className={`size-2 rounded-full ${dot}`} aria-hidden />}
        {label}
      </p>
      <p className={`tabular-nums ${strong ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</p>
    </div>
  );
}
