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
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Flag,
  History,
  Layers,
  LayoutList,
  Pencil,
  Wallet,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useSession } from '../auth/api';
import { ApiError } from '../../lib/api';
import { formatApiMoney } from '../../lib/money';
import { useChangeStatus, useProject } from './api';
import { STATUS_LABEL, StatusBadge } from './StatusBadge';
import { ActivityTab } from './tabs/ActivityTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { MilestonesTab } from './tabs/MilestonesTab';
import { OverviewTab } from './tabs/OverviewTab';
import { PaymentsTab } from './tabs/PaymentsTab';
import { UpsellsTab } from './tabs/UpsellsTab';

const TABS = ['overview', 'milestones', 'payments', 'upsells', 'documents', 'activity'];

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
  // The open tab is in the address (?tab=…): it survives the project reloading after a payment and can be linked.
  const [params, setParams] = useSearchParams();
  const money = (minor: number) => formatApiMoney(minor, project.currency);
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="icon" className="size-8 rounded-full">
              <Link to="/projects" aria-label="Back to Projects">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1 text-sm text-text-muted">
                <Crumb to="/projects">Projects</Crumb>
                <Crumb to={`/clients/${project.client.id}`}>{project.client.name}</Crumb>
                {project.parent && <Crumb to={`/projects/${project.parent.id}`}>{`${project.parent.code} ${project.parent.name}`}</Crumb>}
                <li>
                  <span aria-current="page" className="font-medium text-text">
                    {project.code} {project.name}
                  </span>
                </li>
              </ol>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <StatusBadge status={project.status} />
            {project.phase && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium">Phase {project.phase}</span>}
          </div>
          <p className="text-sm text-text-muted">Owner {project.owner.name}</p>
        </div>
        {project.canEdit && (
          <div className="flex gap-2">
            <MarkCompleted project={project} />
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

      <Tabs
        value={TABS.includes(params.get('tab') ?? '') ? params.get('tab')! : 'overview'}
        onValueChange={(tab) => setParams(tab === 'overview' ? {} : { tab }, { replace: true })}
      >
        <TabsList aria-label="Project sections">
          <TabsTrigger value="overview">
            <LayoutList className="size-4" aria-hidden /> Overview
          </TabsTrigger>
          <TabsTrigger value="milestones">
            <Flag className="size-4" aria-hidden /> Milestones <Count n={project.milestones.length} />
          </TabsTrigger>
          <TabsTrigger value="payments">
            <Wallet className="size-4" aria-hidden /> Payments
          </TabsTrigger>
          <TabsTrigger value="upsells">
            <Layers className="size-4" aria-hidden /> Phases &amp; upsell <Count n={project.upsellProjects.length} />
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="size-4" aria-hidden /> Documents
          </TabsTrigger>
          <TabsTrigger value="activity">
            <History className="size-4" aria-hidden /> Activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab project={project} />
        </TabsContent>
        <TabsContent value="milestones">
          <MilestonesTab project={project} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab project={project} />
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

// D-025: hired work is finished with one clear action rather than a pick from the status list.
function MarkCompleted({ project }: { project: ProjectDetail }) {
  const change = useChangeStatus(project.id);
  if (!ALLOWED_TRANSITIONS[project.status as ProjectStatus].includes('COMPLETED')) return null;
  const complete = () => {
    if (!window.confirm(`Mark ${project.name} as completed?`)) return;
    change.mutate('COMPLETED', {
      onSuccess: () => toast.success('Project completed'),
      onError: (e) => toast.error(e.message),
    });
  };
  return (
    <Button onClick={complete} disabled={change.isPending}>
      <CheckCircle2 className="size-4" /> Mark as completed
    </Button>
  );
}

/** A small count beside a tab label; hidden at zero. Not part of the tab's accessible name. */
function Count({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span aria-hidden className="rounded-full bg-black/10 px-1.5 text-xs tabular-nums">
      {n}
    </span>
  );
}

function Crumb({ to, children }: { to: string; children: string }) {
  return (
    <li className="flex items-center gap-1">
      <Link to={to} className="hover:text-text hover:underline">
        {children}
      </Link>
      <ChevronRight className="size-3.5" aria-hidden />
    </li>
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
