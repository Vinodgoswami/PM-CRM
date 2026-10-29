import { QueryClient } from '@tanstack/react-query';

let client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

/** The app-wide cache. apiFetch reads the CSRF token from the session entry here (never from web storage). */
export function getQueryClient(): QueryClient {
  return client;
}

/** Tests install a fresh client per render. */
export function setQueryClient(next: QueryClient): void {
  client = next;
}
