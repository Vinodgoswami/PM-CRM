import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { dashboard } from '../features/dashboard/fixture';
import { detail, listItem } from '../features/projects/fixtures';
import { renderApp, sessionFor, stubApi } from '../test/render';

/** The product is for project managers reporting to the CEO (D-017): no sales vocabulary on screen. */
// D-028: "booking" and "upsell" are the owner's own words for project work, so they are allowed.
const SALES_WORDS = /\b(sales|salesperson|booked|pipeline|win rate|won|lead|proposal|lost)\b/i;
const owners = { 'GET /owners': { body: { items: [{ id: 'u2', name: 'Rohan Mehta' }] } } };

test('the dashboard speaks project-manager language', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /dashboard': { body: dashboard() },
      ...owners,
      'GET /invoices': { body: { currency: 'INR', otherCurrencyItems: 0, groups: [] } },
    }).fn,
  );
  renderApp('/', sessionFor('CEO'));
  await screen.findByRole('region', { name: 'Team performance' });
  expect(document.body.textContent).not.toMatch(SALES_WORDS);
  expect(screen.getByRole('region', { name: 'Key figures' })).toHaveTextContent('Total booking');
  expect(screen.getByRole('region', { name: 'Collected' })).toHaveTextContent('Confirmation rate');
  expect(screen.getByRole('region', { name: 'Team performance' })).toHaveTextContent('Project manager');
});

test('project stages are Enquiry, Quoted, Confirmed, Active, On hold, Completed, Cancelled', async () => {
  const items = (['LEAD', 'PROPOSAL', 'WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'LOST'] as const).map((status, i) =>
    listItem({ id: `p${i}`, code: `PRJ-000${i}`, name: `Project ${i}`, status }),
  );
  vi.stubGlobal('fetch', stubApi({ 'GET /projects': { body: { items, page: 1, pageSize: 25, total: items.length } }, ...owners }).fn);
  renderApp('/projects', sessionFor('CEO'));
  await screen.findByText('Project 0');
  for (const label of ['Enquiry', 'Quoted', 'Confirmed', 'Active', 'On hold', 'Completed', 'Cancelled']) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  expect(document.body.textContent).not.toMatch(SALES_WORDS);
});

test('the Admin invites Project Managers', async () => {
  const users = { items: [{ id: 'u2', name: 'Rohan Mehta', email: 'rohan@example.com', role: 'SALES', active: true, lastLoginAt: null }] };
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /settings': { body: { companyName: 'Acme', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
      'GET /users': { body: users },
    }).fn,
  );
  renderApp('/users', sessionFor('ADMIN'));
  const user = userEvent.setup();
  expect(await screen.findByText('Rohan Mehta')).toBeInTheDocument();
  expect(screen.getByText('Project Manager')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /invite/i }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByLabelText('Role'));
  expect(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Project Manager' })).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(SALES_WORDS);
});

test('a project page calls upsells "Extra work"', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /projects/p1': { body: detail({ status: 'WON' }) } }).fn);
  renderApp('/projects/p1', sessionFor('CEO'));
  expect(await screen.findByRole('tab', { name: 'Phases & upsell' })).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(SALES_WORDS);
});

test('the audit log shows stage and role names, not stored codes', async () => {
  const entry = (id: string, before: object, after: object) => ({
    id,
    at: '2026-10-30T10:00:00.000Z',
    action: 'project.status',
    entity: 'Project',
    entityId: 'p1',
    before,
    after,
    actor: { id: 'u1', name: 'Asha Admin' },
  });
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /audit': {
        body: {
          items: [entry('a1', { status: 'LEAD' }, { status: 'WON' }), entry('a2', { role: 'SALES' }, { role: 'CEO' })],
          page: 1,
          pageSize: 50,
          total: 2,
        },
      },
    }).fn,
  );
  renderApp('/audit', sessionFor('CEO'));
  expect(await screen.findByText('status: Enquiry → Confirmed')).toBeInTheDocument();
  expect(screen.getByText('role: Project Manager → CEO')).toBeInTheDocument();
});
