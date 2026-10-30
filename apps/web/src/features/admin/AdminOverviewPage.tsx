import { Skeleton } from '@salescrm/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';

const overviewSchema = z.object({
  users: z.object({ total: z.number(), active: z.number(), admins: z.number(), ceos: z.number(), projectManagers: z.number() }),
  clients: z.number(),
  projects: z.number(),
  payments: z.number(),
  documents: z.number(),
});

/** D-021: the Admin's home. How much is in the system — never names, clients or amounts. */
export function AdminOverviewPage() {
  const { data } = useQuery({ queryKey: ['admin-overview'], queryFn: () => apiFetch('/admin/overview', { schema: overviewSchema }) });
  return (
    <section aria-label="Overview" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Overview</h1>
          <p className="text-text-muted">
            Accounts and how much is in the system. Client and project details belong to the CEO and project managers.
          </p>
        </div>
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
        >
          Manage users <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>
      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Group title="People">
            <Stat label="Active users" value={data.users.active} hint={`${data.users.total} in total`} />
            <Stat label="Project managers" value={data.users.projectManagers} />
            <Stat label="CEOs" value={data.users.ceos} />
            <Stat label="Admins" value={data.users.admins} />
          </Group>
          <Group title="Work in the system">
            <Stat label="Clients" value={data.clients} />
            <Stat label="Projects" value={data.projects} />
            <Stat label="Payments recorded" value={data.payments} />
            <Stat label="Documents" value={data.documents} />
          </Group>
        </>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-text-muted">{title}</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{children}</div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface p-5 shadow-card">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
