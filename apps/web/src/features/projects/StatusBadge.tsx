import { type ProjectStatusValue } from '@salescrm/schemas';
import { Badge } from '@salescrm/ui';
import { STATUS_LABEL } from '../../lib/labels';

export { STATUS_LABEL };

const TONE: Record<ProjectStatusValue, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  LEAD: 'neutral',
  PROPOSAL: 'info',
  WON: 'primary',
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  COMPLETED: 'neutral',
  LOST: 'danger',
};

export function StatusBadge({ status }: { status: ProjectStatusValue }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
