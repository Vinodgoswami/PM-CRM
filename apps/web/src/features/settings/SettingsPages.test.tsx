import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';

const settings = { companyName: 'Acme CRM', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 };
const users = {
  items: [
    { id: 'u1', name: 'Test User', email: 'test@example.com', role: 'ADMIN', active: true, lastLoginAt: null },
    { id: 'u2', name: 'Rohan', email: 'rohan@example.com', role: 'SALES', active: true, lastLoginAt: '2026-10-28T10:00:00.000Z' },
  ],
};
const base = { 'GET /settings': { body: settings }, 'GET /users': { body: users } };

test('company settings save only the fields that changed', async () => {
  const api = stubApi({ ...base, 'PATCH /settings': ({ body }) => ({ body: { ...settings, ...(body as object) } }) });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/settings', sessionFor('ADMIN'));
  const user = userEvent.setup();
  const days = await screen.findByLabelText('Due soon (days)');
  await user.clear(days);
  await user.type(days, '10');
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
  expect(api.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ dueSoonDays: 10 });
});

test('inviting a user shows the link to share, with copy', async () => {
  const api = stubApi({
    ...base,
    'POST /users/invite': { status: 201, body: { url: 'http://localhost:5173/invite/abc', expiresAt: '2026-11-01T10:00:00.000Z' } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/settings', sessionFor('ADMIN'));
  const user = userEvent.setup(); // installs user-event's clipboard stub, so spy on it afterwards
  const writeText = vi.spyOn(navigator.clipboard, 'writeText');
  await user.click(await screen.findByRole('tab', { name: 'Users' }));
  await user.click(await screen.findByRole('button', { name: 'Invite user' }));
  await user.type(screen.getByLabelText('Name'), 'Meera');
  await user.type(screen.getByLabelText('Email'), 'meera@example.com');
  await user.selectOptions(screen.getByLabelText('Role'), 'CEO');
  await user.click(screen.getByRole('button', { name: 'Create invite link' }));
  expect(await screen.findByDisplayValue('http://localhost:5173/invite/abc')).toBeInTheDocument();
  expect(api.calls.find((c) => c.path === '/users/invite')!.body).toEqual({ name: 'Meera', email: 'meera@example.com', role: 'CEO' });
  await user.click(screen.getByRole('button', { name: 'Copy link' }));
  expect(writeText).toHaveBeenCalledWith('http://localhost:5173/invite/abc');
});

test('demoting the last admin shows the server explanation', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal(
    'fetch',
    stubApi({
      ...base,
      'PATCH /users/u1': { status: 409, body: { error: { code: 'LAST_ADMIN', message: 'At least one active admin must remain' } } },
    }).fn,
  );
  renderApp('/settings', sessionFor('ADMIN'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'Users' }));
  await user.selectOptions(await screen.findByLabelText('Role for Test User'), 'SALES');
  expect(await screen.findByText('At least one active admin must remain')).toBeInTheDocument();
});

test('audit log filters by entity and pages through results', async () => {
  const entry = (i: number) => ({
    id: `a${i}`,
    action: 'project.status',
    entity: 'Project',
    entityId: 'p1',
    at: '2026-10-29T10:00:00.000Z',
    before: { status: 'LEAD' },
    after: { status: 'PROPOSAL' },
    actor: { id: 'u1', name: 'Test User' },
  });
  const api = stubApi({
    'GET /audit': ({ url }) => ({
      body: {
        items: [entry(Number(url.searchParams.get('page') ?? 1))],
        page: Number(url.searchParams.get('page') ?? 1),
        pageSize: 50,
        total: 120,
      },
    }),
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/audit', sessionFor('CEO'));
  const user = userEvent.setup();
  expect(await screen.findByText('status: LEAD → PROPOSAL')).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Entity'), 'Project');
  await waitFor(() => expect(api.calls.at(-1)!.url.searchParams.get('entity')).toBe('Project'));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(api.calls.at(-1)!.url.searchParams.get('page')).toBe('2'));
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
});
