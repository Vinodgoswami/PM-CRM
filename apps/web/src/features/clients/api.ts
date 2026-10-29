import {
  clientDetailSchema,
  clientListItemSchema,
  contactDtoSchema,
  type ContactInput,
  type CreateClientInput,
  type UpdateClientInput,
  type UpdateContactInput,
} from '@salescrm/schemas';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';

const listSchema = z.object({ items: z.array(clientListItemSchema), page: z.number(), pageSize: z.number(), total: z.number() });

export function useClients(search: string, enabled = true) {
  return useQuery({
    queryKey: ['clients', 'list', search],
    queryFn: () => apiFetch(`/clients${search ? `?${search}` : ''}`, { schema: listSchema }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useClient(id: string) {
  return useQuery({ queryKey: ['clients', 'detail', id], queryFn: () => apiFetch(`/clients/${id}`, { schema: clientDetailSchema }) });
}

function useClientMutation<TInput, TOut>(request: (input: TInput) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: request, onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }) });
}

export const useCreateClient = () =>
  useClientMutation((input: CreateClientInput) => apiFetch('/clients', { method: 'POST', body: input, schema: clientListItemSchema }));
export const useUpdateClient = (id: string) =>
  useClientMutation((input: UpdateClientInput) =>
    apiFetch(`/clients/${id}`, { method: 'PATCH', body: input, schema: clientListItemSchema }),
  );
export const useArchiveClient = (id: string) =>
  useClientMutation(() => apiFetch(`/clients/${id}/archive`, { method: 'POST', schema: clientListItemSchema }));
export const useAddContact = (id: string) =>
  useClientMutation((input: ContactInput) =>
    apiFetch(`/clients/${id}/contacts`, { method: 'POST', body: input, schema: contactDtoSchema }),
  );
export const useUpdateContact = (id: string) =>
  useClientMutation(({ contactId, ...input }: UpdateContactInput & { contactId: string }) =>
    apiFetch(`/clients/${id}/contacts/${contactId}`, { method: 'PATCH', body: input, schema: contactDtoSchema }),
  );
