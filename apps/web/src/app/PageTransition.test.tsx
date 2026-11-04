import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../test/render';
import { detail, listItem } from '../features/projects/fixtures';

// The fading-out page must keep showing the old page; the new page is built once, so nothing opened on it
// in the first moment (a dialog, a tab) is thrown away.
test('opening a project from the list builds the project page once', async () => {
  const api = stubApi({
    'GET /projects': { body: { items: [listItem()], page: 1, pageSize: 25, total: 1 } },
    'GET /projects/p1': { body: detail() },
    'GET /projects/p1/documents': { body: { items: [] } },
    'GET /projects/p1/activity': { body: { items: [] } },
    'GET /owners': { body: { items: [] } },
    'GET /clients': { body: { items: [], page: 1, pageSize: 100, total: 0 } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects', sessionFor('SALES'));
  await userEvent.click(await screen.findByRole('link', { name: 'Website Redesign' }));
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await new Promise((r) => setTimeout(r, 600));
  await waitFor(() => expect(api.calls.filter((c) => c.path === '/projects/p1')).toHaveLength(1));
});
