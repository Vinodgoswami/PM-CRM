import { can } from '@salescrm/auth/permissions';
import { type ClientDetail, contactSchema } from '@salescrm/schemas';
import { Badge, Button, Card, Dialog, DialogContent, DialogTitle, EmptyState, Input, Label, Skeleton, toast } from '@salescrm/ui';
import { Archive, Pencil, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatApiMoney } from '../../lib/money';
import { useSession } from '../auth/api';
import { STATUS_LABEL } from '../projects/StatusBadge';
import { useAddContact, useArchiveClient, useClient, useUpdateContact } from './api';
import { ClientFormDialog } from './ClientFormDialog';
import { useConfirm } from '../../components/ConfirmDialog';

type ProjectRef = ClientDetail['projects'][number];

/** Orders projects so each upsell follows its parent, with its nesting depth. */
function projectTree(projects: ProjectRef[]): { project: ProjectRef; depth: number }[] {
  const ids = new Set(projects.map((p) => p.id));
  const children = new Map<string | null, ProjectRef[]>();
  for (const p of projects) {
    const parent = p.parentProjectId && ids.has(p.parentProjectId) ? p.parentProjectId : null;
    children.set(parent, [...(children.get(parent) ?? []), p]);
  }
  const out: { project: ProjectRef; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const p of children.get(parent) ?? []) {
      out.push({ project: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function ClientDetailPage() {
  const { id = '' } = useParams();
  const { data: client, isPending, isError } = useClient(id);
  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError) return <EmptyState title="Client not found" action={<Link to="/clients">Back to clients</Link>} />;
  return <ClientView client={client} />;
}

function ClientView({ client }: { client: ClientDetail }) {
  const { data: session } = useSession();
  const canWrite = !!session && can(session.user, 'clients.write');
  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const archive = useArchiveClient(client.id);
  const confirm = useConfirm();
  const makePrimary = useUpdateContact(client.id);
  const money = (m: number) => formatApiMoney(m, client.currency);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/clients" className="text-sm text-text-muted hover:underline">
            ← Clients
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{client.name}</h1>
            {client.archived && <Badge>Archived</Badge>}
          </div>
          {client.company && <p className="text-text-muted">{client.company}</p>}
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
            {!client.archived && (
              <Button
                variant="outline"
                onClick={() =>
                  void confirm({
                    title: `Archive ${client.name}?`,
                    message: `Do you really want to archive ${client.name}? Its projects stay; the client is hidden from lists.`,
                    confirmLabel: 'Archive',
                  }).then(
                    (ok) =>
                      ok &&
                      archive.mutate(undefined, {
                        onSuccess: () => toast.success('Client archived'),
                        onError: (e) => toast.error(e.message),
                      }),
                  )
                }
              >
                <Archive className="size-4" /> Archive
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Booked', client.bookedMinor],
          ['Collected', client.collectedMinor],
          ['Outstanding', client.outstandingMinor],
        ].map(([label, value]) => (
          <Card key={label as string} className="p-4">
            <p className="text-sm text-text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{money(value as number)}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Contacts</h2>
            {canWrite && (
              <Button size="sm" variant="outline" onClick={() => setAddingContact(true)}>
                <Plus className="size-4" /> Add contact
              </Button>
            )}
          </div>
          {client.contacts.length === 0 ? (
            <p className="text-sm text-text-muted">No contacts yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {client.contacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium">{c.name ?? c.email}</p>
                    <p className="text-text-muted">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </p>
                  </div>
                  {c.isPrimary ? (
                    <Badge tone="primary">Primary</Badge>
                  ) : (
                    canWrite && (
                      <Button size="sm" variant="ghost" onClick={() => makePrimary.mutate({ contactId: c.id, isPrimary: true })}>
                        <Star className="size-4" /> Make primary
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-medium">Projects</h2>
          {client.projects.length === 0 ? (
            <p className="text-sm text-text-muted">No projects yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {projectTree(client.projects).map(({ project, depth }) => (
                <li key={project.id} data-depth={depth} className="flex items-center gap-2" style={{ paddingLeft: `${depth * 1.25}rem` }}>
                  {depth > 0 && <span className="text-text-muted">↳</span>}
                  <Link to={`/projects/${project.id}`} className="text-primary hover:underline">
                    {project.code} {project.name}
                  </Link>
                  <span className="text-text-muted">{STATUS_LABEL[project.status as keyof typeof STATUS_LABEL] ?? project.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {client.notes && (
        <Card>
          <h2 className="font-medium">Notes</h2>
          <p className="mt-2 text-sm whitespace-pre-line">{client.notes}</p>
        </Card>
      )}

      {editing && <ClientFormDialog open onOpenChange={setEditing} client={client} />}
      {addingContact && <ContactDialog clientId={client.id} onClose={() => setAddingContact(false)} />}
    </section>
  );
}

function ContactDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const add = useAddContact(clientId);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Add contact</DialogTitle>
        <form
          noValidate
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = contactSchema.safeParse({ name, email, phone });
            if (!parsed.success) return setError(parsed.error.issues[0]!.message);
            add.mutate(parsed.data, { onSuccess: onClose, onError: (err) => setError(err.message) });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ct-name">Name</Label>
            <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-email">Email</Label>
            <Input id="ct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-phone">Phone</Label>
            <Input id="ct-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={add.isPending}>
              Save contact
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
