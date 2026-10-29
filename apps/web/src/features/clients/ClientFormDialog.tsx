import { type ClientDetail, createClientSchema, updateClientSchema } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, toast } from '@salescrm/ui';
import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { useCreateClient, useUpdateClient } from './api';

type Errors = Record<string, string>;

/** Create (with an optional primary contact) or edit a client. */
export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: ClientDetail;
}) {
  const create = useCreateClient();
  const update = useUpdateClient(client?.id ?? '');
  const [name, setName] = useState(client?.name ?? '');
  const [company, setCompany] = useState(client?.company ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const onError = (err: Error) =>
      err instanceof ApiError && err.status === 409
        ? setErrors({ name: 'A client with this name already exists.' })
        : toast.error(err.message);
    if (client) {
      const parsed = updateClientSchema.safeParse({ name, company, notes });
      if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return update.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError });
    }
    const parsed = createClientSchema.safeParse({
      name,
      company,
      notes,
      ...(email ? { contact: { email, ...(contactName ? { name: contactName } : {}) } } : {}),
    });
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: (c) => {
        toast.success(`${c.name} added`);
        onOpenChange(false);
      },
      onError,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{client ? 'Edit client' : 'New client'}</DialogTitle>
        <DialogDescription>Clients can also be added straight from the project form.</DialogDescription>
        <form onSubmit={submit} noValidate className="mt-4 space-y-4">
          <Row id="client-name" label="Name" error={errors.name}>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Row>
          <Row id="client-company" label="Company">
            <Input id="client-company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </Row>
          {!client && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Row id="contact-name" label="Contact name">
                <Input id="contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </Row>
              <Row id="contact-email" label="Contact email" error={errors['contact.email']}>
                <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Row>
            </div>
          )}
          <Row id="client-notes" label="Notes">
            <textarea
              id="client-notes"
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Row>
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending || update.isPending}>
              Save client
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
