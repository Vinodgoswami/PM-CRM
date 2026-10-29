import { can } from '@salescrm/auth/permissions';
import { clientListItemSchema } from '@salescrm/schemas';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';
import { useSession } from '../auth/api';

/** Salespeople for filters; only for company-wide viewers (CEO / Admin). Stable, unlike lists derived from results. */
export function useOwners() {
  const { data: session } = useSession();
  const enabled = !!session && can(session.user, 'dashboard.company');
  const query = useQuery({
    queryKey: ['owners'],
    queryFn: () => apiFetch('/owners', { schema: z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) }) }),
    enabled,
    staleTime: 5 * 60_000,
  });
  return { enabled, owners: query.data?.items ?? [] };
}

export function useClientOptions() {
  const query = useQuery({
    queryKey: ['clients', 'options'],
    queryFn: () =>
      apiFetch('/clients?pageSize=100', {
        schema: z.object({ items: z.array(clientListItemSchema), page: z.number(), pageSize: z.number(), total: z.number() }),
      }),
    staleTime: 5 * 60_000,
  });
  return query.data?.items.map((c) => ({ id: c.id, name: c.name })) ?? [];
}
