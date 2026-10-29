import {
  linkResponseSchema,
  type InviteUserInput,
  type Role,
  type Settings,
  settingsSchema,
  type UpdateSettingsInput,
  userListItemSchema,
} from '@salescrm/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => apiFetch('/settings', { schema: settingsSchema }) });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => apiFetch('/settings', { method: 'PATCH', body: input, schema: settingsSchema }),
    onSuccess: (s: Settings) => qc.setQueryData(['settings'], s),
  });
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => apiFetch('/users', { schema: z.object({ items: z.array(userListItemSchema) }) }) });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; role?: Role; active?: boolean }) =>
      apiFetch(`/users/${id}`, { method: 'PATCH', body: input, schema: userListItemSchema }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useInviteUser() {
  return useMutation({
    mutationFn: (input: InviteUserInput) => apiFetch('/users/invite', { method: 'POST', body: input, schema: linkResponseSchema }),
  });
}

export function useResetLink() {
  return useMutation({ mutationFn: (id: string) => apiFetch(`/users/${id}/reset-link`, { method: 'POST', schema: linkResponseSchema }) });
}
