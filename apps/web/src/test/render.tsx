import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type SessionResponse } from '@salescrm/schemas';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { setQueryClient } from '../lib/query-client';
import { routes } from '../app/router';
import { ConfirmProvider } from '../components/ConfirmDialog';

/** Renders the real route tree at `path` with the session cache pre-filled (null = signed out). */
export function renderApp(path: string, session: SessionResponse | null | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // undefined = let the app ask the (stubbed) API itself.
  if (session !== undefined) queryClient.setQueryData(['session'], session);
  setQueryClient(queryClient);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

export function sessionFor(role: 'ADMIN' | 'SALES' | 'CEO'): SessionResponse {
  return {
    user: { id: 'u1', name: 'Test User', email: 'test@example.com', role, avatarUrl: null, displayCurrency: null },
    csrfToken: 'csrf-token',
  };
}

export function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fn, calls };
}

type Reply = { status?: number; body?: unknown };
/** Fake API keyed by "METHOD /path" (path without /api/v1 and query). Unmatched calls fail the test loudly. */
export function stubApi(routes: Record<string, Reply | ((req: { url: URL; body: unknown }) => Reply)>) {
  const calls: { method: string; path: string; url: URL; body: unknown; headers: Headers }[] = [];
  const fn = async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    calls.push({ method, path, url, body, headers: new Headers(init?.headers) });
    const route = routes[`${method} ${path}`];
    if (!route) throw new Error(`Unexpected request ${method} ${path}`);
    const reply = typeof route === 'function' ? route({ url, body }) : route;
    const status = reply.status ?? 200;
    return new Response(status === 204 || reply.body === undefined ? null : JSON.stringify(reply.body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fn, calls };
}

/** Picks `value` in one of our custom dropdowns (OptionSelect / Select), the way a user would: open, click. */
export async function choose(user: { click: (el: Element) => Promise<void> }, trigger: HTMLElement, value: string) {
  await user.click(trigger);
  const list = await screen.findByRole('listbox');
  const option = list.querySelector<HTMLElement>(`[role="option"][data-value="${CSS.escape(value)}"]`);
  if (!option) throw new Error(`No option with value "${value}" in ${trigger.getAttribute('aria-label') ?? trigger.id}`);
  await user.click(option);
}
