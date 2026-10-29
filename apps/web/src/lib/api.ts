import { apiErrorSchema, type SessionResponse } from '@salescrm/schemas';
import { type ZodType } from 'zod';
import { getQueryClient } from './query-client';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api/v1'; // same-origin; dev proxy / host rewrite forwards to the API (D-011)

export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; schema: ZodType<T>; headers?: Record<string, string> },
): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = getQueryClient().getQueryData<SessionResponse | null>(['session'])?.csrfToken;
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    if (parsed.success) throw new ApiError(res.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details);
    throw new ApiError(res.status, 'ERROR', 'Something went wrong. Please try again.');
  }
  return opts.schema.parse(json);
}
