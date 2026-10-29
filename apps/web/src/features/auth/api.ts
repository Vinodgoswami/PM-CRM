import {
  type AcceptInviteInput,
  type LoginInput,
  type ResetPasswordInput,
  type SessionResponse,
  sessionResponseSchema,
} from '@salescrm/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch } from '../../lib/api';

export const SESSION_KEY = ['session'] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<SessionResponse | null> => {
      try {
        return await apiFetch('/auth/session', { schema: sessionResponseSchema });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: 3,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => apiFetch('/auth/login', { method: 'POST', body: input, schema: sessionResponseSchema }),
    onSuccess: (session) => qc.setQueryData(SESSION_KEY, session),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST', schema: z.undefined() }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(SESSION_KEY, null);
    },
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AcceptInviteInput) =>
      apiFetch('/auth/invite/accept', { method: 'POST', body: input, schema: sessionResponseSchema }),
    onSuccess: (session) => qc.setQueryData(SESSION_KEY, session),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => apiFetch('/auth/password/reset', { method: 'POST', body: input, schema: z.undefined() }),
  });
}
