import { type Dashboard } from '@salescrm/schemas';
import { Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { Link } from 'react-router';
import { formatDate } from '../../lib/dates';
import { OWNER, STATUS_LABEL } from '../../lib/labels';
import { Panel } from './Panel';

/** Work not yet confirmed (Enquiry, Quoted): what may come in next, biggest first. */
export function UpcomingBookings({ items, money }: { items: Dashboard['upcomingBookings']; money: (minor: number) => string }) {
  const total = items.reduce((s, b) => s + b.expectedAmountMinor, 0);
  return (
    <Panel
      title="Upcoming bookings"
      subtitle={`${items.length} project${items.length === 1 ? '' : 's'} · ${money(total)} not yet confirmed`}
    >
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">No enquiries or quotes waiting.</p>
      ) : (
        <Table className="text-sm">
          <THead>
            <TR>
              <TH>Project</TH>
              <TH>Stage</TH>
              <TH>{OWNER}</TH>
              <TH>Expected start</TH>
              <TH className="text-right">Expected amount</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link to={`/projects/${b.id}`} className="font-medium hover:underline">
                    {b.code} {b.name}
                  </Link>
                  <p className="text-xs text-text-muted">{b.client.name}</p>
                </TD>
                <TD>{STATUS_LABEL[b.status as keyof typeof STATUS_LABEL] ?? b.status}</TD>
                <TD>{b.owner.name}</TD>
                <TD>{b.startDate ? formatDate(b.startDate) : '—'}</TD>
                <TD className="text-right font-semibold tabular-nums">{money(b.expectedAmountMinor)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}
