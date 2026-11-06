import { can } from '@salescrm/auth/permissions';
import { createProjectSchema, type ProjectDetail, updateProjectSchema, userListItemSchema } from '@salescrm/schemas';
import { Button, Card, EmptyState, Input, Label, Skeleton, toast } from '@salescrm/ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Pencil } from 'lucide-react';
import { ClientFormDialog } from '../clients/ClientFormDialog';
import { MilestonesTab } from './tabs/MilestonesTab';
import { type PickedFile, ProjectFilesPicker } from './ProjectFilesPicker';
import { z } from 'zod';
import { ApiError, apiFetch } from '../../lib/api';
import { useSession } from '../auth/api';
import { useClient } from '../clients/api';
import { useSettings } from '../settings/api';
import { uploadDocument, useCreateProject, useProject, useUpdateProject } from './api';
import { type ClientChoice, ClientCombobox } from './ClientCombobox';
import { type MilestoneRow, MilestoneRowsEditor } from './MilestoneRowsEditor';
import { OWNER } from '../../lib/labels';
import { OptionSelect } from '../../components/OptionSelect';
import { CurrencySelect } from '../../components/CurrencySelect';
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

  const [name, setName] = useState(params.get('name') ?? '');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ownerId, setOwnerId] = useState('');
  const [expected, setExpected] = useState<{ minor: number | null; error: string | null }>({ minor: null, error: null });
  const [rows, setRows] = useState<MilestoneRow[]>([]);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const parentProjectId = params.get('parent') ?? undefined;
  const [phaseKind, setPhaseKind] = useState<'UPSELL' | 'SCOPE'>('UPSELL');
  const baseCurrency = useSettings().data?.baseCurrency ?? 'INR';
  // Amounts are entered in the project's currency: the one chosen here, else the client's, else the base currency.
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const currency = currencyChoice ?? (client && 'clientId' in client ? client.currency : baseCurrency);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const input = {
      name,
      description,
      // D-025: only hired work is entered here, so it starts Active and is marked complete from its page.
      status: 'ACTIVE' as const,
      ...(startDate ? { startDate } : {}),
      ...(client && 'clientId' in client ? { clientId: client.clientId } : {}),
      ...(client && 'newClient' in client
        ? { newClient: { name: client.newClient.name, ...(client.newClient.email ? { email: client.newClient.email } : {}) } }
        : {}),
      ...(isAdmin && ownerId ? { ownerId } : {}),
      expectedAmountMinor: expected.minor ?? undefined,
      currency,
      ...(parentProjectId ? { parentProjectId, phaseKind } : {}),
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
    if (expected.minor === null) found.expectedAmountMinor = expected.error ?? 'Enter the booking amount';
    if (mustChoose && !ownerId) found.ownerId = 'Choose the project manager for this project.';
    rows.forEach((r, i) => {
      if (r.amountMinor === null) found[`milestones.${i}.amountMinor`] = r.amountError ?? 'Enter an amount';
      if (!r.dueDate) found[`milestones.${i}.dueDate`] = 'Choose a due date';
    });
    // MS-5: milestones may not add up to more than the booking amount.
    if (expected.minor !== null && rows.reduce((t, r) => t + (r.amountMinor ?? 0), 0) > expected.minor)
      found.expectedAmountMinor = 'Milestones add up to more than the booking amount. Lower a milestone or raise the booking.';
    setErrors(found);
    if (!parsed.success || Object.keys(found).length) return;

    create.mutate(parsed.data, {
      onSuccess: async (project) => {
        toast.success(`${project.code} created`);
        // Documents need the project's id, so they upload right after it is created.
        if (files.length > 0) {
          setUploading(true);
          const failed: string[] = [];
          for (const f of files) {
            try {
              await uploadDocument(project.id, f.file, f.type);
            } catch {
              failed.push(f.file.name);
            }
          }
          setUploading(false);
          if (failed.length) toast.error(`Not uploaded: ${failed.join(', ')}. Add them from the Documents tab.`);
          else toast.success(`${files.length} document${files.length > 1 ? 's' : ''} uploaded`);
        }
        navigate(`/projects/${project.id}${files.length ? '?tab=documents' : ''}`);
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
          toast.error(err.message);
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
        <h1 className="text-2xl font-semibold">{parentProjectId ? 'New phase' : 'New project'}</h1>
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
            <p role="status" className="rounded-md bg-accent px-3 py-2 text-sm">
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
            {parentProjectId && (
              <Field id="phase-kind" label="Phase type">
                <PhaseKindSelect id="phase-kind" value={phaseKind} onChange={setPhaseKind} />
              </Field>
            )}
            <Field id="currency" label="Project currency">
              <CurrencySelect id="currency" value={currency} onChange={setCurrencyChoice} />
            </Field>
            <Field id="expected" label="Booking amount" error={errors.expectedAmountMinor}>
              <MoneyInput id="expected" currency={currency} onValue={(minor, error) => setExpected({ minor, error })} />
            </Field>
            {/* D-042: when the work starts; amounts in other currencies are converted at that day's rate. */}
            <Field id="start-date" label="Start date" error={errors.startDate}>
              <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            {isAdmin && (
              <Field id="owner" label={OWNER} error={errors.ownerId}>
                <OptionSelect
                  id="owner"
                  className={selectClass}
                  value={mustChoose ? ownerId : ownerId || (me ?? '')}
                  onValueChange={(v) => setOwnerId(v)}
                  aria-invalid={!!errors.ownerId || undefined}
                >
                  {mustChoose && <option value="">Choose a project manager</option>}
                  {owners.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </OptionSelect>
              </Field>
            )}
          </div>
        </Card>
        <Card>
          <MilestoneRowsEditor rows={rows} onChange={setRows} expectedMinor={expected.minor} currency={currency} errors={errors} />
        </Card>
        <Card className="space-y-3">
          <div>
            <h2 className="font-medium">Documents</h2>
            <p className="text-sm text-text-muted">Optional. Uploaded to the project when you create it.</p>
          </div>
          <ProjectFilesPicker files={files} onChange={setFiles} />
        </Card>
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/projects">Cancel</Link>
          </Button>
          <Button type="submit" disabled={create.isPending || uploading}>
            {uploading ? 'Uploading documents…' : create.isPending ? 'Creating…' : 'Create project'}
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
  // D-027: the project may move to another existing client billed in its currency.
  const [client, setClient] = useState<ClientChoice>({
    clientId: project.client.id,
    name: project.client.name,
    currency: project.currency,
  });
  const clientId = client && 'clientId' in client ? client.clientId : null;
  const clientDetail = useClient(clientId ?? '');
  const [editingClient, setEditingClient] = useState(false);
  const [description, setDescription] = useState(project.description);
  const [startDate, setStartDate] = useState(project.startDate ?? '');
  const [expected, setExpected] = useState<{ minor: number | null; error: string | null }>({
    minor: project.expectedAmountMinor,
    error: null,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [phaseKind, setPhaseKind] = useState<'UPSELL' | 'SCOPE'>(project.phaseKind ?? 'UPSELL');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = updateProjectSchema.safeParse({
      ...(project.parent && phaseKind !== project.phaseKind ? { phaseKind } : {}),
      name,
      description,
      ...(clientId && clientId !== project.client.id ? { clientId } : {}),
      ...(startDate !== (project.startDate ?? '') ? { startDate: startDate || null } : {}),
      expectedAmountMinor: expected.minor ?? undefined,
      updatedAt: project.updatedAt,
    });
    const found: Errors = parsed.success ? {} : issuesToErrors(parsed.error.issues);
    if (expected.minor === null) found.expectedAmountMinor = expected.error ?? 'Enter the booking amount';
    if (!clientId) found.clientId = 'Choose a client';
    else if (client && 'currency' in client && client.currency !== project.currency)
      found.clientId = `Choose a client billed in ${project.currency}; ${client.name} is billed in ${client.currency}.`;
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
          <Field id="client" label="Client" error={errors.clientId}>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <ClientCombobox id="client" value={client} onChange={setClient} invalid={!!errors.clientId} allowNew={false} />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!clientDetail.data}
                aria-label="Edit client details"
                onClick={() => setEditingClient(true)}
              >
                <Pencil className="size-4" /> Edit client
              </Button>
            </div>
            <p className="text-xs text-text-muted">Editing the client changes its name and contact on every one of its projects.</p>
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
          {project.parent && (
            <Field id="phase-kind" label="Phase type">
              <PhaseKindSelect id="phase-kind" value={phaseKind} onChange={setPhaseKind} />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="expected" label="Booking amount" error={errors.expectedAmountMinor}>
              <MoneyInput
                id="expected"
                currency={project.currency}
                defaultMinor={project.expectedAmountMinor}
                onValue={(minor, error) => setExpected({ minor, error })}
              />
            </Field>
            <Field id="start-date" label="Start date" error={errors.startDate}>
              <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
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
      <Card className="space-y-3">
        <div>
          <h2 className="font-medium">Milestones</h2>
          <p className="text-sm text-text-muted">
            Changes here save at once. Changing the amount of a paid milestone resets its payments after you confirm.
          </p>
        </div>
        <MilestonesTab project={project} />
      </Card>
      {editingClient && clientDetail.data && <ClientFormDialog open onOpenChange={setEditingClient} client={clientDetail.data} />}
    </section>
  );
}

/** D-037: whether a phase is extra work (upsell) or a part of the original project's scope. */
function PhaseKindSelect({ id, value, onChange }: { id: string; value: 'UPSELL' | 'SCOPE'; onChange: (v: 'UPSELL' | 'SCOPE') => void }) {
  return (
    <>
      <OptionSelect id={id} className={selectClass} value={value} onValueChange={(v) => onChange(v as 'UPSELL' | 'SCOPE')}>
        <option value="UPSELL">Upsell — extra work the client added</option>
        <option value="SCOPE">Scope part — part of the original project</option>
      </OptionSelect>
      <p className="text-xs text-text-muted">
        {value === 'UPSELL' ? 'Counts as upsell on the dashboard.' : 'Counts towards the initial booking, not upsell.'}
      </p>
    </>
  );
}
