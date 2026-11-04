import { screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../test/render';

// Slow hosts (free Render, a waking database): a thin bar shows that fresh data is still on its way.
test('a loading bar shows while data is being fetched, and goes away when it arrives', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const api = stubApi({});
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    await gate;
    return api.fn(url, init);
  });
  renderApp('/projects', sessionFor('SALES'));
  expect(await screen.findByRole('progressbar', { name: 'Loading' })).toBeInTheDocument();
  release();
  await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Loading' })).toBeNull());
});
