import { type Dashboard } from '@salescrm/schemas';
import { Panel } from './Panel';

const GROUP_LABEL: Record<string, string> = {
  OVERDUE: 'Overdue',
  THIS_WEEK: 'This week',
  THIS_MONTH: 'Later this month',
  NEXT_MONTH: 'Next month',
  LATER: 'Later',
  UNSCHEDULED: 'No due date',
};

/** D-022: unpaid balances by when they fall due — how many and how much, with no client or project names. */
export function UpcomingSummary({ items, money }: { items: Dashboard['upcomingSummary']; money: (minor: number) => string }) {
  return (
    <Panel title="Upcoming invoices" subtitle="Unpaid balances by when they are due" className="lg:col-span-7">
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing left to collect.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((g) => (
            <li key={g.key} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className={g.key === 'OVERDUE' ? 'font-semibold text-danger' : 'text-text-muted'}>{GROUP_LABEL[g.key] ?? g.key}</span>
              <span className="font-semibold tabular-nums">
                {g.count} · {money(g.totalMinor)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
