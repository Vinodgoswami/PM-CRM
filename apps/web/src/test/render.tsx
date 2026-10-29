import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type SessionResponse } from '@salescrm/schemas';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { setQueryClient } from '../lib/query-client';
import { routes } from '../app/router';

/** Renders the real route tree at `path` with the session cache pre-filled (null = signed out). */
export function renderApp(path: string, session: SessionResponse | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['session'], session);
  setQueryClient(queryClient);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

export function sessionFor(role: 'ADMIN' | 'SALES' | 'CEO'): SessionResponse {
  return { user: { id: 'u1', name: 'Test User', email: 'test@example.com', role }, csrfToken: 'csrf-token' };
}

export function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fn, calls };
}
