import { type ProjectDetail } from '@salescrm/schemas';
import { Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { Link } from 'react-router';
import { formatDate } from '../../../lib/dates';
import { formatApiMoney } from '../../../lib/money';
import { StatusBadge } from '../StatusBadge';

export function OverviewTab({ project }: { project: ProjectDetail }) {
  const duration = project.durationValue ? `${project.durationValue} ${project.durationUnit === 'WEEKS' ? 'weeks' : 'months'}` : '—';
  return (
    <div className="space-y-6">
      {project.description && <p className="max-w-prose whitespace-pre-line">{project.description}</p>}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Item label="Start">{formatDate(project.startDate)}</Item>
        <Item label="Duration">{duration}</Item>
        <Item label="End">{formatDate(project.endDate)}</Item>
        <Item label="Won on">{formatDate(project.wonAt)}</Item>
        <Item label="Expected amount">{formatApiMoney(project.expectedAmountMinor, project.currency)}</Item>
        {project.parent && (
          <Item label="Upsell of">
            <Link className="text-primary hover:underline" to={`/projects/${project.parent.id}`}>
              {project.parent.code} {project.parent.name}
            </Link>
          </Item>
        )}
      </dl>

      {project.upsellProjects.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-medium">Upsell projects</h2>
          <ul className="space-y-1 text-sm">
            {project.upsellProjects.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <Link className="text-primary hover:underline" to={`/projects/${u.id}`}>
                  {u.code} {u.name}
                </Link>
                <StatusBadge status={u.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="font-medium">Milestones</h2>
        {project.milestones.length === 0 ? (
          <p className="text-sm text-text-muted">No milestones yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Task</TH>
                <TH className="text-right">Amount</TH>
                <TH>Due</TH>
                <TH className="text-right">Paid</TH>
              </TR>
            </THead>
            <TBody>
              {project.milestones.map((m) => (
                <TR key={m.id}>
                  <TD>M{m.number}</TD>
                  <TD>{m.title}</TD>
                  <TD className="text-right tabular-nums">{formatApiMoney(m.amountMinor, project.currency)}</TD>
                  <TD>{formatDate(m.dueDate)}</TD>
                  <TD className="text-right tabular-nums">{formatApiMoney(m.paidMinor, project.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
