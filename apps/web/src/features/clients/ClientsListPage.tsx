import { can } from '@salescrm/auth/permissions';
import { Badge, Button, EmptyState, Input, Skeleton, Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatApiMoney } from '../../lib/money';
import { useSession } from '../auth/api';
import { useClients } from './api';
import { ClientFormDialog } from './ClientFormDialog';

export function ClientsListPage() {
  const { data: session } = useSession();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const search = new URLSearchParams({
    ...(debounced ? { q: debounced } : {}),
    ...(archived ? { includeArchived: 'true' } : {}),
    pageSize: '100',
  }).toString();
  const { data, isPending, isError } = useClients(search);
  const canWrite = !!session && can(session.user, 'clients.write');

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Clients</h1>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New client
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search clients"
          placeholder="Search name or company…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-72"
        />
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived
        </label>
      </div>
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <EmptyState title="Could not load clients" />
      ) : data.items.length === 0 ? (
        <EmptyState title="No clients yet" description="Add one here or from the project form." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Company</TH>
              <TH>Primary email</TH>
              <TH className="text-right">Projects</TH>
              <TH className="text-right">Total booking</TH>
              <TH className="text-right">Paid</TH>
              <TH className="text-right">Outstanding</TH>
            </TR>
          </THead>
          <TBody>
            {data.items.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link to={`/clients/${c.id}`} className="font-medium text-primary hover:underline">
                    {c.name}
                  </Link>
                  {c.archived && (
                    <Badge className="ml-2" tone="neutral">
                      Archived
                    </Badge>
                  )}
                </TD>
                <TD>{c.company ?? '—'}</TD>
                <TD>{c.primaryEmail ?? '—'}</TD>
                <TD className="text-right tabular-nums">{c.projects}</TD>
                <TD className="text-right tabular-nums">{formatApiMoney(c.bookedMinor, c.currency)}</TD>
                <TD className="text-right tabular-nums text-success">{formatApiMoney(c.collectedMinor, c.currency)}</TD>
                <TD className={`text-right tabular-nums ${c.outstandingMinor > 0 ? 'font-medium text-danger' : ''}`}>
                  {formatApiMoney(c.outstandingMinor, c.currency)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {creating && <ClientFormDialog open onOpenChange={setCreating} />}
    </section>
  );
}
