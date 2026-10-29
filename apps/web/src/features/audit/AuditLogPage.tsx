import { Button, EmptyState, Label, Skeleton, Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';

const PAGE_SIZE = 50;
const ENTITIES = ['Project', 'Client', 'ClientContact', 'User', 'AuthToken', 'Setting'];

const auditSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      entity: z.string(),
      entityId: z.string(),
      at: z.string(),
      before: z.unknown(),
      after: z.unknown(),
      actor: z.object({ id: z.string(), name: z.string() }),
    }),
  ),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

/** "status: LEAD → PROPOSAL; role: SALES → CEO" from the before/after field maps. */
function summarise(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys
    .map((k) =>
      k in b && k in a ? `${k}: ${String(b[k])} → ${String(a[k])}` : k in a ? `${k}: ${String(a[k])}` : `${k}: ${String(b[k])} removed`,
    )
    .join('; ');
}

export function AuditLogPage() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const search = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...(entity ? { entity } : {}) }).toString();
  const { data, isPending, isError } = useQuery({
    queryKey: ['audit', search],
    queryFn: () => apiFetch(`/audit?${search}`, { schema: auditSchema }),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="audit-entity">Entity</Label>
          <select
            id="audit-entity"
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>
      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <EmptyState title="Could not load the audit log" />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Who</TH>
                <TH>Action</TH>
                <TH>Record</TH>
                <TH>Change</TH>
              </TR>
            </THead>
            <TBody>
              {data.items.map((i) => (
                <TR key={i.id}>
                  <TD>{new Date(i.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</TD>
                  <TD>{i.actor.name}</TD>
                  <TD className="font-mono text-xs">{i.action}</TD>
                  <TD className="text-xs text-text-muted">
                    {i.entity} {i.entityId.slice(0, 8)}
                  </TD>
                  <TD className="max-w-96 truncate whitespace-normal text-sm">{summarise(i.before, i.after)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="flex items-center justify-end gap-2 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              Page {page} of {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
