import { can } from '@salescrm/auth/permissions';
import { createProjectSchema, type ProjectDetail, updateProjectSchema, userListItemSchema } from '@salescrm/schemas';
import { Button, Card, EmptyState, Input, Label, Skeleton, toast } from '@salescrm/ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { ApiError, apiFetch } from '../../lib/api';
import { useSession } from '../auth/api';
import { useClient } from '../clients/api';
import { useSettings } from '../settings/api';
import { useCreateProject, useProject, useUpdateProject } from './api';
import { type ClientChoice, ClientCombobox } from './ClientCombobox';
import { type MilestoneRow, MilestoneRowsEditor } from './MilestoneRowsEditor';
import { OWNER } from '../../lib/labels';
import { MoneyInput } from './MoneyInput';

const selectClass = 'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm';

type Errors = Record<string, string>;
const issuesToErrors = (issues: z.core.$ZodIssue[]): Errors =>
  Object.fromEntries(issues.map((i) => [i.path.join('.'), i.message]).reverse());

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ProjectFormPage() {
  const { id } = useParams();
  return id ? <EditProject id={id} /> : <CreateProject />;
}

function useOwnerOptions() {
  const { data: session } = useSession();
  const isAdmin = !!session && can(session.user, 'projects.reassign');
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/users', { schema: z.object({ items: z.array(userListItemSchema) }) }),
    enabled: isAdmin,
  });
  // D-018: the CEO does not own projects; they choose the project manager who does.
  const mustChoose = session?.user.role === 'CEO';
  return { isAdmin, mustChoose, owners: (users.data?.items ?? []).filter((u) => u.active && u.role === 'SALES'), me: session?.user.id };
}

function CreateProject() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const create = useCreateProject();
  const { isAdmin, mustChoose, owners, me } = useOwnerOptions();

  const presetClient = params.get('client');
  const preset = useClient(presetClient ?? '');
  const [client, setClient] = useState<ClientChoice>(null);
  useEffect(() => {
    if (presetClient && preset.data && !client)
      setClient({ clientId: presetClient, name: preset.data.name, currency: preset.data.currency });
  }, [presetClient, preset.data, client]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'LEAD' | 'PROPOSAL' | 'WON' | 'ACTIVE'>('LEAD');
  const [ownerId, setOwnerId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [durationValue, setDurationValue] = useState('');
  const [durationUnit, setDurationUnit] = useState<'WEEKS' | 'MONTHS'>('MONTHS');
  const [expected, setExpected] = useState<{ minor: number | null; error: string | null }>({ minor: null, error: null });
  const [rows, setRows] = useState<MilestoneRow[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const parentProjectId = params.get('parent') ?? undefined;
  const baseCurrency = useSettings().data?.baseCurrency ?? 'INR';
  // Amounts are entered in the project's currency: the client's, or the base currency for a new client.
  const currency = client && 'clientId' in client ? client.currency : baseCurrency;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const input = {
      name,
      description,
      status,
      ...(client && 'clientId' in client ? { clientId: client.clientId } : {}),
      ...(client && 'newClient' in client
        ? { newClient: { name: client.newClient.name, ...(client.newClient.email ? { email: client.newClient.email } : {}) } }
        : {}),
      ...(isAdmin && ownerId ? { ownerId } : {}),
      ...(startDate ? { startDate } : {}),
      ...(durationValue ? { durationValue: Number(durationValue), durationUnit } : {}),
      expectedAmountMinor: expected.minor ?? undefined,
      currency,
      ...(parentProjectId ? { parentProjectId } : {}),
      milestones: rows.map((r) => ({
        title: r.title,
        amountMinor: r.amountMinor ?? undefined,
        ...(r.dueDate ? { dueDate: r.dueDate } : {}),
      })),
    };
    const parsed = createProjectSchema.safeParse(input);
    const found: Errors = parsed.success ? {} : issuesToErrors(parsed.error.issues);
    // Zod skips the object-level client refine while other fields fail, so check it here as well.
    if (!client) found.clientId = 'Choose an existing client or add a new one';
    if (expected.minor === null) found.expectedAmountMinor = expected.error ?? 'Enter an amount';
    if (mustChoose && !ownerId) found.ownerId = 'Choose the project manager for this project.';
    rows.forEach((r, i) => {
      if (r.amountMinor === null) found[`milestones.${i}.amountMinor`] = r.amountError ?? 'Enter an amount';
    });
    setErrors(found);
    if (!parsed.success || Object.keys(found).length) return;

    create.mutate(parsed.data, {
      onSuccess: (project) => {
        toast.success(`${project.code} created`);
        navigate(`/projects/${project.id}`);
      },
      onError: (err) => {
        // C-2: the new client already exists — switch to it so the next submit links the project to it.
        const clientId =
          err instanceof ApiError && err.status === 409 ? (err.details as { clientId?: string } | undefined)?.clientId : undefined;
        if (clientId && client && 'newClient' in client) {
          setClient({ clientId, name: client.newClient.name, currency });
          setNotice(
            `A client called ${client.newClient.name} already exists. Using the existing client ${client.newClient.name} — submit again to continue.`,
          );
        } else {
          setNotice(err.message);
        }
      },
    });
  };

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/projects" className="text-sm text-text-muted hover:underline">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold">{parentProjectId ? 'New upsell project' : 'New project'}</h1>
      </div>
      <form onSubmit={submit} noValidate className="space-y-6">
        <Card className="space-y-4">
          <Field id="name" label="Project name" error={errors.name}>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name || undefined} />
          </Field>
          <Field id="client" label="Client" error={errors.clientId}>
            <ClientCombobox id="client" value={client} onChange={setClient} invalid={!!errors.clientId} />
          </Field>
          {client && 'newClient' in client && (
            <div className="grid gap-3 rounded-md bg-accent p-3 sm:grid-cols-2">
              <Field id="new-client-name" label="New client name" error={errors['newClient.name']}>
                <Input
                  id="new-client-name"
                  value={client.newClient.name}
                  onChange={(e) => setClient({ newClient: { ...client.newClient, name: e.target.value } })}
                />
              </Field>
              <Field id="new-client-email" label="Client email" error={errors['newClient.email']}>
                <Input
                  id="new-client-email"
                  type="email"
                  value={client.newClient.email ?? ''}
                  onChange={(e) => setClient({ newClient: { ...client.newClient, email: e.target.value || undefined } })}
                />
              </Field>
            </div>
          )}
          {notice && (
            <p role="alert" className="rounded-md bg-accent px-3 py-2 text-sm">
              {notice}
            </p>
          )}
          <Field id="description" label="Description">
            <textarea
              id="description"
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="status" label="Status">
              <select id="status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="LEAD">Enquiry</option>
                <option value="PROPOSAL">Quoted</option>
                <option value="WON">Confirmed</option>
                <option value="ACTIVE">Active</option>
              </select>
            </Field>
            {isAdmin && (
              <Field id="owner" label={OWNER} error={errors.ownerId}>
                <select
                  id="owner"
                  className={selectClass}
                  value={mustChoose ? ownerId : ownerId || me}
                  onChange={(e) => setOwnerId(e.target.value)}
                  aria-invalid={!!errors.ownerId || undefined}
                >
                  {mustChoose && <option value="">Choose a project manager</option>}
                  {owners.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="start" label="Start date">
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field id="duration" label="Duration">
              <div className="flex gap-2">
                <Input id="duration" type="number" min={1} value={durationValue} onChange={(e) => setDurationValue(e.target.value)} />
                <select
                  aria-label="Duration unit"
                  className={selectClass}
                  value={durationUnit}
                  onChange={(e) => setDurationUnit(e.target.value as 'WEEKS' | 'MONTHS')}
                >
                  <option value="MONTHS">months</option>
                  <option value="WEEKS">weeks</option>
                </select>
              </div>
            </Field>
            <Field id="expected" label="Expected amount" error={errors.expectedAmountMinor}>
              <MoneyInput id="expected" currency={currency} onValue={(minor, error) => setExpected({ minor, error })} />
            </Field>
          </div>
        </Card>
        <Card>
          <MilestoneRowsEditor rows={rows} onChange={setRows} expectedMinor={expected.minor} currency={currency} errors={errors} />
        </Card>
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/projects">Cancel</Link>
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </section>
  );
}

function EditProject({ id }: { id: string }) {
  const { data, isPending, isError } = useProject(id);
  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError) return <EmptyState title="Could not load this project" />;
  if (!data.canEdit) return <EmptyState title="You can't edit this project" />;
  return <EditForm project={data} />;
}

function EditForm({ project }: { project: ProjectDetail }) {
  const navigate = useNavigate();
  const update = useUpdateProject(project.id);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [startDate, setStartDate] = useState(project.startDate ?? '');
  const [durationValue, setDurationValue] = useState(project.durationValue ? String(project.durationValue) : '');
  const [durationUnit, setDurationUnit] = useState<'WEEKS' | 'MONTHS'>(project.durationUnit ?? 'MONTHS');
  const [expected, setExpected] = useState<{ minor: number | null; error: string | null }>({
    minor: project.expectedAmountMinor,
    error: null,
  });
  const [errors, setErrors] = useState<Errors>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = updateProjectSchema.safeParse({
      name,
      description,
      startDate: startDate || null,
      durationValue: durationValue ? Number(durationValue) : null,
      durationUnit: durationValue ? durationUnit : null,
      expectedAmountMinor: expected.minor ?? undefined,
      updatedAt: project.updatedAt,
    });
    const found: Errors = parsed.success ? {} : issuesToErrors(parsed.error.issues);
    if (expected.minor === null) found.expectedAmountMinor = expected.error ?? 'Enter an amount';
    setErrors(found);
    if (!parsed.success || Object.keys(found).length) return;
    update.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Project saved');
        navigate(`/projects/${project.id}`);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to={`/projects/${project.id}`} className="text-sm text-text-muted hover:underline">
          ← {project.code} {project.name}
        </Link>
        <h1 className="text-2xl font-semibold">Edit project</h1>
      </div>
      <form onSubmit={submit} noValidate>
        <Card className="space-y-4">
          <Field id="name" label="Project name" error={errors.name}>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="description" label="Description">
            <textarea
              id="description"
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="start" label="Start date">
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field id="duration" label="Duration">
              <div className="flex gap-2">
                <Input id="duration" type="number" min={1} value={durationValue} onChange={(e) => setDurationValue(e.target.value)} />
                <select
                  aria-label="Duration unit"
                  className={selectClass}
                  value={durationUnit}
                  onChange={(e) => setDurationUnit(e.target.value as 'WEEKS' | 'MONTHS')}
                >
                  <option value="MONTHS">months</option>
                  <option value="WEEKS">weeks</option>
                </select>
              </div>
            </Field>
            <Field id="expected" label="Expected amount" error={errors.expectedAmountMinor}>
              <MoneyInput
                id="expected"
                currency={project.currency}
                defaultMinor={project.expectedAmountMinor}
                onValue={(minor, error) => setExpected({ minor, error })}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <Link to={`/projects/${project.id}`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={update.isPending}>
              Save changes
            </Button>
          </div>
        </Card>
      </form>
    </section>
  );
}
