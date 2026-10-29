import { type ProjectDetail } from '@salescrm/schemas';
import { Badge } from '@salescrm/ui';

type Status = ProjectDetail['milestones'][number]['status'];

const STATUS: Record<Status, { label: string; tone: 'success' | 'danger' | 'info' | 'warning' | 'neutral' }> = {
  PAID: { label: 'Paid', tone: 'success' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  PARTIALLY_PAID: { label: 'Partly paid', tone: 'info' },
  DUE_SOON: { label: 'Due soon', tone: 'warning' },
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  UNSCHEDULED: { label: 'No due date', tone: 'neutral' },
};

export function MilestoneStatusBadge({ status }: { status: Status }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}
