import { EmptyState, Skeleton } from '@salescrm/ui';
import { useProjectActivity } from '../api';

const LABEL: Record<string, string> = {
  'project.create': 'created the project',
  'project.update': 'edited the project',
  'project.status': 'changed the status',
  'project.owner': 'changed the owner',
  'project.parent.set': 'changed the extra-work link',
  'project.upsell.add': 'added an extra work amount',
  'project.upsell.remove': 'removed an extra work amount',
  'document.upload': 'uploaded a document',
  'document.delete': 'deleted a document',
};

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function ActivityTab({ projectId }: { projectId: string }) {
  const { data, isPending, isError } = useProjectActivity(projectId);
  if (isPending) return <Skeleton className="h-20 w-full" />;
  if (isError) return <EmptyState title="Could not load activity" />;
  if (data.items.length === 0) return <EmptyState title="No activity yet" />;
  return (
    <ol className="space-y-3">
      {data.items.map((i) => {
        const status = i.action === 'project.status' ? (i.after as { status?: string } | null)?.status : undefined;
        return (
          <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">{i.actor.name}</span>
            <span>{LABEL[i.action] ?? i.action}</span>
            {status && <span className="text-text-muted">to {status.replace('_', ' ').toLowerCase()}</span>}
            <time className="ml-auto text-xs text-text-muted" dateTime={i.at}>
              {when(i.at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
