import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';

const overviewSchema = z.object({
  users: z.object({ total: z.number(), active: z.number(), admins: z.number(), ceos: z.number(), projectManagers: z.number() }),
  clients: z.number(),
  projects: z.number(),
  payments: z.number(),
  documents: z.number(),
});

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface p-5 shadow-card">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

/** D-022: the people and work counts, shown at the top of the Admin's dashboard. */
export function AdminCounts() {
  const { data } = useQuery({ queryKey: ['admin-overview'], queryFn: () => apiFetch('/admin/overview', { schema: overviewSchema }) });
  if (!data) return null;
  return (
    <section aria-label="People and work" className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
      <Stat label="Active users" value={data.users.active} />
      <Stat label="Project managers" value={data.users.projectManagers} />
      <Stat label="CEOs" value={data.users.ceos} />
      <Stat label="Admins" value={data.users.admins} />
      <Stat label="Clients" value={data.clients} />
      <Stat label="Projects" value={data.projects} />
      <Stat label="Payments recorded" value={data.payments} />
      <Stat label="Documents" value={data.documents} />
    </section>
  );
}
