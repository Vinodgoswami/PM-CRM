import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { listItem } from './fixtures';

const page = (items: unknown[]) => ({ body: { items, page: 1, pageSize: 25, total: items.length } });

test('lists projects with formatted rupee amounts', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /projects': page([listItem()]) }).fn);
  renderApp('/projects', sessionFor('CEO'));
  const row = (await screen.findByText('Website Redesign')).closest('tr')!;
  expect(within(row).getByText('PRJ-0001')).toBeInTheDocument();
  expect(within(row).getByText('₹1,25,000.00')).toBeInTheDocument();
  expect(within(row).getByText('₹25,000.00')).toBeInTheDocument();
  expect(within(row).getByText('Active')).toBeInTheDocument();
});

test('the status filter is kept in the URL and refetches', async () => {
  const api = stubApi({ 'GET /projects': page([listItem()]) });
  vi.stubGlobal('fetch', api.fn);
  const { router } = renderApp('/projects', sessionFor('CEO'));
  await screen.findByText('Website Redesign');
  await userEvent.click(screen.getByRole('link', { name: 'Not yet confirmed' }));
  await waitFor(() => expect(router.state.location.search).toContain('status=LEAD%2CPROPOSAL'));
  await waitFor(() => expect(api.calls.at(-1)!.url.searchParams.get('status')).toBe('LEAD,PROPOSAL'));
});

test('an empty result shows the empty state with a create action', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /projects': page([]) }).fn);
  renderApp('/projects', sessionFor('SALES'));
  expect(await screen.findByText('No projects match')).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /new project/i }).length).toBeGreaterThan(0);
});

test('the CEO can start a new project (D-018)', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /projects': page([listItem()]) }).fn);
  renderApp('/projects', sessionFor('CEO'));
  await screen.findByText('Website Redesign');
  expect(screen.getByRole('link', { name: /new project/i })).toBeInTheDocument();
});
