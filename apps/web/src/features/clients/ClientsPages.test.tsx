import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';

const acme = {
  id: 'c1',
  name: 'Acme',
  company: 'Acme Pvt Ltd',
  primaryEmail: 'ap@acme.test',
  projects: 3,
  archived: false,
  currency: 'INR',
  bookedMinor: 25000000,
  collectedMinor: 15000000,
  outstandingMinor: 2000000,
};
const list = (items: unknown[]) => ({ body: { items, page: 1, pageSize: 25, total: items.length } });
const detail = {
  ...acme,
  country: 'IN',
  currency: 'INR',
  notes: 'Pays on the 5th',
  contacts: [
    { id: 'k1', name: 'Riya', email: 'ap@acme.test', phone: null, isPrimary: true },
    { id: 'k2', name: null, email: 'cto@acme.test', phone: '+91 90000', isPrimary: false },
  ],
  projects: [
    { id: 'p1', code: 'PRJ-0001', name: 'Website', status: 'COMPLETED', parentProjectId: null },
    { id: 'p2', code: 'PRJ-0002', name: 'Website phase 2', status: 'ACTIVE', parentProjectId: 'p1' },
    { id: 'p3', code: 'PRJ-0003', name: 'Mobile app', status: 'LEAD', parentProjectId: null },
  ],
  bookedMinor: 25000000,
  collectedMinor: 15000000,
  outstandingMinor: 2000000,
};

test('clients list shows columns and searches by name', async () => {
  const api = stubApi({ 'GET /clients': list([acme]) });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/clients', sessionFor('SALES'));
  const row = (await screen.findByText('Acme')).closest('tr')!;
  expect(within(row).getByText('ap@acme.test')).toBeInTheDocument();
  expect(within(row).getByText('3')).toBeInTheDocument();
  expect(within(row).getByText('₹2,50,000.00')).toBeInTheDocument();
  expect(within(row).getByText('₹1,50,000.00')).toBeInTheDocument();
  expect(within(row).getByText('₹20,000.00')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Total contracted' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Search clients'), 'acm');
  await waitFor(() => expect(api.calls.at(-1)!.url.searchParams.get('q')).toBe('acm'));
});

test('client detail lists contacts, totals and upsell projects under their parent', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /clients/c1': { body: detail } }).fn);
  renderApp('/clients/c1', sessionFor('SALES'));
  expect(await screen.findByRole('heading', { name: 'Acme' })).toBeInTheDocument();
  expect(screen.getByText('₹2,50,000.00')).toBeInTheDocument();
  expect(screen.getByText('cto@acme.test')).toBeInTheDocument();
  const upsell = screen.getByRole('link', { name: /Website phase 2/ }).closest('li')!;
  expect(upsell).toHaveAttribute('data-depth', '1');
  expect(screen.getByRole('link', { name: /Mobile app/ }).closest('li')).toHaveAttribute('data-depth', '0');
});

test('creating a client validates the name, then saves', async () => {
  const api = stubApi({ 'GET /clients': list([]), 'POST /clients': { status: 201, body: acme } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/clients', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'New client' }));
  await user.click(screen.getByRole('button', { name: 'Save client' }));
  expect(await screen.findByText('Enter the client name')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Name'), 'Acme');
  await user.type(screen.getByLabelText('Contact email'), 'ap@acme.test');
  await user.click(screen.getByRole('button', { name: 'Save client' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({ name: 'Acme', contact: { email: 'ap@acme.test' } });
});

test('archiving asks for confirmation first', async () => {
  const api = stubApi({ 'GET /clients/c1': { body: detail }, 'POST /clients/c1/archive': { body: { ...acme, archived: true } } });
  vi.stubGlobal('fetch', api.fn);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  renderApp('/clients/c1', sessionFor('CEO'));
  const archive = await screen.findByRole('button', { name: 'Archive' });
  await userEvent.click(archive);
  expect(api.calls.some((c) => c.path === '/clients/c1/archive')).toBe(false);
  await userEvent.click(archive);
  await waitFor(() => expect(api.calls.some((c) => c.path === '/clients/c1/archive')).toBe(true));
  expect(confirm).toHaveBeenCalledTimes(2);
});

test('the CEO can add and edit clients (D-018)', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /clients': list([acme]), 'GET /clients/c1': { body: detail } }).fn);
  renderApp('/clients', sessionFor('CEO'));
  await screen.findByText('Acme');
  expect(screen.getByRole('button', { name: 'New client' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Acme' }));
  await screen.findByRole('heading', { name: 'Acme' });
  expect(screen.getAllByRole('button', { name: /edit|archive|add contact/i }).length).toBeGreaterThan(0);
});

test('a client row opens to list its projects with booking, milestones and payments, each linking to the project', async () => {
  const project = {
    id: 'p1',
    code: 'PRJ-0001',
    name: 'Website',
    status: 'ACTIVE',
    currency: 'INR',
    client: { id: 'c1', name: 'Acme' },
    owner: { id: 'u1', name: 'Test User' },
    wonAt: '2026-09-01',
    contractValueMinor: 12500000,
    collectedMinor: 5000000,
    outstandingMinor: 2500000,
    nextDueDate: null,
    hasOverdue: false,
    parentProjectId: null,
    expectedAmountMinor: 10000000,
    milestoneCount: 4,
    paidMilestoneCount: 1,
  };
  const api = stubApi({ 'GET /clients': list([acme]), 'GET /projects': { body: { items: [project], page: 1, pageSize: 100, total: 1 } } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/clients', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Show projects for Acme' }));
  const panel = await screen.findByRole('region', { name: 'Projects for Acme' });
  expect(api.calls.find((c) => c.path === '/projects')!.url.search).toContain('clientId=c1');
  const link = await within(panel).findByRole('link', { name: /Website/ });
  expect(link).toHaveAttribute('href', '/projects/p1');
  expect(link).toHaveTextContent('₹1,25,000.00'); // worth = booking + extra work
  expect(link).toHaveTextContent('₹1,00,000.00'); // initial booking
  expect(link).toHaveTextContent('1 / 4');
  expect(link).toHaveTextContent('₹50,000.00 of ₹1,25,000.00');
  expect(link).toHaveTextContent('Active');
});

test('D-039 client totals are shown in your dashboard currency', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /clients': list([{ ...acme, currency: 'INR', totalsCurrency: 'USD', bookedMinor: 1200 }]) }).fn);
  renderApp('/clients', sessionFor('SALES'));
  expect(await screen.findByText('$12.00')).toBeInTheDocument();
});
