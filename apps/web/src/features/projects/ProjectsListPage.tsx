import { can } from '@salescrm/auth/permissions';
import { type ProjectListItem } from '@salescrm/schemas';
import { Button, EmptyState, Input, Skeleton, Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useSession } from '../auth/api';
import { formatDate } from '../../lib/dates';
import { formatViewMoney } from '../../lib/money';
import { useProjects } from './api';
import { StatusBadge } from './StatusBadge';

const VIEWS = [
  { label: 'All', params: {} },
  { label: 'Active', params: { status: 'ACTIVE' } },
  { label: 'Not yet confirmed', params: { status: 'LEAD,PROPOSAL' } },
  { label: 'Has overdue', params: { hasOverdue: 'true' } },
] as const;

const col = createColumnHelper<ProjectListItem>();
const money = (key: 'contractValueMinor' | 'collectedMinor' | 'outstandingMinor') => (p: ProjectListItem) =>
  formatViewMoney(p[key], p.currency, p.view);

const COLUMNS = [
  col.accessor('code', { header: 'Code', meta: { sort: 'code' } }),
  col.accessor('name', {
    header: 'Project',
    meta: { sort: 'name' },
    cell: (c) => (
      <Link to={`/projects/${c.row.original.id}`} className="font-medium text-primary hover:underline">
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor((p) => p.client.name, { id: 'client', header: 'Client' }),
  col.accessor((p) => p.owner.name, { id: 'owner', header: 'Owner' }),
  col.accessor('status', { header: 'Status', cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor(money('contractValueMinor'), {
    id: 'contractValue',
    header: 'Contract value',
    meta: { sort: 'contractValue', numeric: true },
  }),
  col.accessor(money('collectedMinor'), { id: 'collected', header: 'Collected', meta: { numeric: true } }),
  col.accessor(money('outstandingMinor'), {
    id: 'outstanding',
    header: 'Outstanding',
    meta: { sort: 'outstanding', numeric: true },
    cell: (c) => <span className={c.row.original.hasOverdue ? 'font-medium text-danger' : undefined}>{c.getValue()}</span>,
  }),
  col.accessor('nextDueDate', { header: 'Next due', meta: { sort: 'nextDue' }, cell: (c) => formatDate(c.getValue()) }),
  col.display({
    id: 'progress',
    header: 'Collected %',
    cell: (c) => {
      const p = c.row.original;
      const pct = p.contractValueMinor > 0 ? Math.min(100, Math.round((p.collectedMinor * 100) / p.contractValueMinor)) : 0;
      return (
        <div className="flex items-center gap-2" aria-label={`${pct}% collected`}>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-accent">
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-text-muted">{pct}%</span>
        </div>
      );
    },
  }),
];

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- generic parameters are required by the declaration
  interface ColumnMeta<TData, TValue> {
    sort?: string;
    numeric?: boolean;
  }
}

export function ProjectsListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const { data, isPending, isError, refetch } = useProjects(params.toString());
  const [q, setQ] = useState(params.get('q') ?? '');
  const canCreate = !!session.data && can(session.data.user, 'projects.write');

  // Debounced search kept in the URL so views can be shared and survive reloads.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') === q) return;
      const next = new URLSearchParams(params);
      if (q) next.set('q', q);
      else next.delete('q');
      next.delete('page');
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [q, params, setParams]);

  const table = useReactTable({ data: data?.items ?? [], columns: COLUMNS, getCoreRowModel: getCoreRowModel() });
  const sort = params.get('sort');
  const dir = params.get('dir') ?? 'asc';
  const page = Number(params.get('page') ?? '1');
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const setSort = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('dir', sort === key && dir === 'asc' ? 'desc' : 'asc');
    next.set('sort', key);
    setParams(next);
  };
  const goTo = (n: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(n));
    setParams(next);
  };
  const viewSearch = (v: (typeof VIEWS)[number]) => new URLSearchParams(v.params as Record<string, string>).toString();
  const currentView = VIEWS.find(
    (v) => viewSearch(v) === new URLSearchParams([...params].filter(([k]) => k === 'status' || k === 'hasOverdue')).toString(),
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {canCreate && (
          <Button asChild>
            <Link to="/projects/new">
              <Plus className="size-4" /> New project
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Saved views" className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <Link
              key={v.label}
              to={{ search: viewSearch(v) ? `?${viewSearch(v)}` : '' }}
              aria-current={currentView === v ? 'page' : undefined}
              className="rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-primary"
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <Input
          aria-label="Search projects"
          placeholder="Search name or code…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="ml-auto max-w-64"
        />
      </div>

      {isPending ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Could not load projects"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="No projects match"
          description="Try another view or search, or add a new project."
          action={
            canCreate ? (
              <Button asChild>
                <Link to="/projects/new">New project</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table>
            <THead>
              {table.getHeaderGroups().map((hg) => (
                <TR key={hg.id}>
                  {hg.headers.map((h) => {
                    const meta = h.column.columnDef.meta;
                    const active = meta?.sort && meta.sort === sort;
                    return (
                      <TH
                        key={h.id}
                        className={meta?.numeric ? 'text-right' : undefined}
                        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        {meta?.sort ? (
                          <button
                            type="button"
                            onClick={() => setSort(meta.sort!)}
                            className="inline-flex items-center gap-1 hover:text-text"
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {active && (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </TH>
                    );
                  })}
                </TR>
              ))}
            </THead>
            <TBody>
              {table.getRowModel().rows.map((row) => (
                <TR
                  key={row.id}
                  className="cursor-pointer"
                  onClick={(e) => (e.target as HTMLElement).closest('a,button') || navigate(`/projects/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TD key={cell.id} className={cell.column.columnDef.meta?.numeric ? 'text-right tabular-nums' : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="flex items-center justify-between text-sm text-text-muted">
            <span>
              {data.total} project{data.total === 1 ? '' : 's'}
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
                  Previous
                </Button>
                <span>
                  Page {page} of {pages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => goTo(page + 1)}>
                  Next
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
