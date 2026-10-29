import { ALLOWED_TRANSITIONS, type ProjectStatus } from '@salescrm/core';
import { PROJECT_STATUSES, type ProjectDetail } from '@salescrm/schemas';
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@salescrm/ui';
import { AlertTriangle, ChevronDown, Pencil } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useSession } from '../auth/api';
import { ApiError } from '../../lib/api';
import { formatApiMoney } from '../../lib/money';
import { useChangeStatus, useProject } from './api';
import { STATUS_LABEL, StatusBadge } from './StatusBadge';
import { ActivityTab } from './tabs/ActivityTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { OverviewTab } from './tabs/OverviewTab';
import { UpsellsTab } from './tabs/UpsellsTab';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { data: project, isPending, isError, error } = useProject(id);

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (isError) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <EmptyState
        title={missing ? 'Project not found' : 'Could not load this project'}
        action={<Link to="/projects">Back to projects</Link>}
      />
    );
  }
  return <ProjectView project={project} />;
}

function ProjectView({ project }: { project: ProjectDetail }) {
  const money = (minor: number) => formatApiMoney(minor, project.currency);
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-text-muted">
            {project.code} ·{' '}
            <Link to={`/clients/${project.client.id}`} className="hover:underline">
              {project.client.name}
            </Link>{' '}
            · Owner {project.owner.name}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
        </div>
        {project.canEdit && (
          <div className="flex gap-2">
            <StatusMenu project={project} />
            <Button asChild variant="outline">
              <Link to={`/projects/${project.id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
          </div>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Contract value" value={money(project.contractValueMinor)} />
        <Stat label="Collected" value={money(project.collectedMinor)} />
        <Stat label="Outstanding" value={money(project.outstandingMinor)} tone={project.hasOverdue ? 'danger' : undefined} />
      </div>
      {project.unscheduledMinor !== 0 && (
        <p className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          {project.unscheduledMinor > 0
            ? `${money(project.unscheduledMinor)} not yet in milestones.`
            : `Milestones exceed the contract value by ${money(-project.unscheduledMinor)}.`}
        </p>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="upsells">Upsells</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab project={project} />
        </TabsContent>
        <TabsContent value="upsells">
          <UpsellsTab project={project} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab project={project} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab projectId={project.id} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</p>
    </Card>
  );
}

function StatusMenu({ project }: { project: ProjectDetail }) {
  const { data: session } = useSession();
  const change = useChangeStatus(project.id);
  const isAdmin = session?.user.role === 'ADMIN';
  // Admin may move any status (PS-1); everyone else sees only the documented arrows.
  const options = (
    isAdmin ? PROJECT_STATUSES.filter((s) => s !== project.status) : ALLOWED_TRANSITIONS[project.status as ProjectStatus]
  ) as ProjectStatus[];
  if (options.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={change.isPending}>
          Change status <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() =>
              change.mutate(s, {
                onSuccess: () => toast.success(`Moved to ${STATUS_LABEL[s]}`),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            {STATUS_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
