import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { visibleNav } from '../../app/nav';
import { dashboard } from '../dashboard/fixture';
import { renderApp, sessionFor, stubApi } from '../../test/render';

// D-022: the Admin sees the business figures and the people counts; no client or project names.
const overview = {
  users: { total: 6, active: 5, admins: 1, ceos: 1, projectManagers: 3 },
  clients: 12,
  projects: 30,
  payments: 84,
  documents: 9,
};
const anonymous = dashboard({
  anonymous: true,
  upcomingSummary: [
    { key: 'OVERDUE', count: 2, totalMinor: 3000000 },
    { key: 'THIS_WEEK', count: 1, totalMinor: 500000 },
  ],
  upcoming: [],
  overdue: [],
  recentPayments: [],
  topClients: [],
  clientRevenue: [],
  upcomingBookings: [],
});

test('the Admin’s top bar has Dashboard and Users; Settings and Audit stay as icons', () => {
  expect(visibleNav({ id: 'a', role: 'ADMIN' }).map((i) => i.label)).toEqual(['Dashboard', 'Users', 'Settings', 'Audit log']);
});

test('the Admin’s dashboard shows people counts, business figures and upcoming invoice totals — no names', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({ 'GET /dashboard': { body: anonymous }, 'GET /admin/overview': { body: overview }, 'GET /owners': { body: { items: [] } } })
      .fn,
  );
  renderApp('/', sessionFor('ADMIN'));
  expect(await screen.findByRole('region', { name: 'Collected' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Key figures' })).toHaveTextContent('Contracted');
  const people = await screen.findByRole('region', { name: 'People and work' });
  expect(within(people).getByText('Project managers').closest('div')).toHaveTextContent('3');
  const due = screen.getByRole('region', { name: 'Upcoming invoices' });
  expect(within(due).getByText('Overdue').closest('li')).toHaveTextContent('2 · ₹30,000.00');
  expect(within(due).getByText('This week').closest('li')).toHaveTextContent('1 · ₹5,000.00');
  for (const hidden of [
    'Upcoming dues',
    'Due-date calendar',
    'Overdue milestones',
    'Recent payments',
    'Revenue by client',
    'Upcoming bookings',
  ]) {
    expect(screen.queryByRole('region', { name: hidden })).toBeNull();
  }
  expect(screen.queryByRole('link', { name: /new project/i })).toBeNull();
  // Month bars do not open lists of payments or projects for the Admin.
  await userEvent.click(screen.getByRole('button', { name: /^Dec: / }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('Users is its own page: people and pending invites with resend and cancel', async () => {
  const api = stubApi({
    'GET /users': {
      body: { items: [{ id: 'u1', name: 'Test User', email: 'test@example.com', role: 'ADMIN', active: true, lastLoginAt: null }] },
    },
    'GET /users/invites': {
      body: {
        items: [
          {
            id: 'i1',
            email: 'vikram@x.test',
            name: 'Vikram Shah',
            role: 'CEO',
            expiresAt: '2026-11-02T10:00:00.000Z',
            invitedBy: 'Test User',
          },
        ],
      },
    },
    'POST /users/invites/i1/resend': {
      status: 201,
      body: { url: 'http://localhost:5173/invite/new', expiresAt: '2026-11-02T10:00:00.000Z' },
    },
    'DELETE /users/invites/i1': { status: 204 },
  });
  vi.stubGlobal('fetch', api.fn);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderApp('/users', sessionFor('ADMIN'));
  const user = userEvent.setup();
  expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
  const invites = await screen.findByRole('region', { name: 'Pending invites' });
  const row = within(invites).getByText('vikram@x.test').closest('tr')!;
  expect(row).toHaveTextContent('CEO');
  expect(row).toHaveTextContent('Invited');
  await user.click(within(row).getByRole('button', { name: 'Resend link' }));
  expect(await screen.findByDisplayValue('http://localhost:5173/invite/new')).toBeInTheDocument();
  await user.click(within(row).getByRole('button', { name: 'Cancel invite' }));
  expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/users/invites/i1')).toBe(true);
});
