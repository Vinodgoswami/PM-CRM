import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { choose, renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

const clients = {
  body: {
    items: [
      {
        id: 'c1',
        name: 'Acme',
        company: null,
        primaryEmail: null,
        projects: 2,
        archived: false,
        currency: 'INR',
        bookedMinor: 0,
        collectedMinor: 0,
        outstandingMinor: 0,
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
  },
};
const settings = { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } };
const created = { status: 201, body: detail({ id: 'p9', code: 'PRJ-0009' }) };
const projectRoutes = {
  'GET /settings': settings,
  'GET /projects/p9': { body: detail({ id: 'p9', code: 'PRJ-0009' }) },
  'GET /projects/p9/documents': { body: { items: [] } },
  'GET /projects/p9/activity': { body: { items: [] } },
};

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Project name'), 'Website');
  await user.type(screen.getByLabelText('Booking amount'), '1,00,000');
}

test('choosing an existing client from the combobox sends its id', async () => {
  const api = stubApi({ 'GET /clients': clients, 'POST /projects': created, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  const { router } = renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.type(screen.getByPlaceholderText('Search clients…'), 'ac');
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p9'));
  const body = api.calls.find((c) => c.method === 'POST')!.body as Record<string, unknown>;
  expect(body).toMatchObject({ name: 'Website', clientId: 'c1', expectedAmountMinor: 10000000 });
  expect(body).not.toHaveProperty('newClient');
});

test('"+ Add new client" sends a new client in the same request', async () => {
  const api = stubApi({
    'GET /clients': { body: { items: [], page: 1, pageSize: 20, total: 0 } },
    'POST /projects': created,
    ...projectRoutes,
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.type(screen.getByPlaceholderText('Search clients…'), 'Bluepeak');
  await user.click(await screen.findByRole('option', { name: /add new client/i }));
  expect(screen.getByLabelText('New client name')).toHaveValue('Bluepeak');
  await user.type(screen.getByLabelText('Client email'), 'ap@bluepeak.test');
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({ newClient: { name: 'Bluepeak', email: 'ap@bluepeak.test' } });
});

test('a duplicate new client switches to the existing one', async () => {
  let attempt = 0;
  const api = stubApi({
    'GET /clients': { body: { items: [], page: 1, pageSize: 20, total: 0 } },
    'POST /projects': () =>
      ++attempt === 1
        ? {
            status: 409,
            body: { error: { code: 'CONFLICT', message: 'A client with this name already exists', details: { clientId: 'c1' } } },
          }
        : created,
    ...projectRoutes,
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.type(screen.getByPlaceholderText('Search clients…'), 'Acme');
  await user.click(await screen.findByRole('option', { name: /add new client/i }));
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  expect(await screen.findByText(/using the existing client acme/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(attempt).toBe(2));
  expect(api.calls.filter((c) => c.method === 'POST')[1]!.body).toMatchObject({ clientId: 'c1' });
});

test('milestone rows show what is left to schedule and are sent with the project', async () => {
  const api = stubApi({ 'GET /clients': clients, 'POST /projects': created, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  await user.click(screen.getByRole('button', { name: 'Add milestone' }));
  await user.type(screen.getByLabelText('Milestone 1 task'), 'Design');
  await user.type(screen.getByLabelText('Milestone 1 amount'), '40,000');
  await user.type(screen.getByLabelText('Milestone 1 due date'), '2026-11-15');
  expect(screen.getByText('₹60,000.00 not yet in milestones')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add milestone' }));
  await user.type(screen.getByLabelText('Milestone 2 task'), 'Build');
  await user.type(screen.getByLabelText('Milestone 2 amount'), '60,000');
  await user.type(screen.getByLabelText('Milestone 2 due date'), '2026-12-15');
  expect(screen.getByText('Milestones add up to the booking amount')).toBeInTheDocument();

  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  expect((api.calls.find((c) => c.method === 'POST')!.body as { milestones: unknown[] }).milestones).toEqual([
    { title: 'Design', amountMinor: 4000000, dueDate: '2026-11-15' },
    { title: 'Build', amountMinor: 6000000, dueDate: '2026-12-15' },
  ]);
});

test('missing required fields are reported before anything is sent', async () => {
  const api = stubApi({ 'GET /clients': clients, 'GET /settings': settings });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
  expect(await screen.findByText('Enter the project name')).toBeInTheDocument();
  expect(screen.getByText('Choose an existing client or add a new one')).toBeInTheDocument();
  expect(screen.getByText('Enter the booking amount')).toBeInTheDocument();
  expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
});

test('amounts follow the chosen client currency and the currency is sent', async () => {
  const tokyo = {
    body: {
      items: [
        {
          id: 'c7',
          name: 'Tokyo Co',
          company: null,
          primaryEmail: null,
          projects: 0,
          archived: false,
          currency: 'JPY',
          bookedMinor: 0,
          collectedMinor: 0,
          outstandingMinor: 0,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    },
  };
  const api = stubApi({ 'GET /clients': tokyo, 'POST /projects': created, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user); // types 1,00,000 before the client is known
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.click(await screen.findByRole('option', { name: 'Tokyo Co' }));
  expect(screen.getAllByText('JPY').length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({ currency: 'JPY', expectedAmountMinor: 100000 });
});

test('D-025 a new project is hired work: no status or duration; it is created Active', async () => {
  const api = stubApi({ 'GET /clients': clients, 'POST /projects': created, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  expect(screen.queryByLabelText('Status')).toBeNull();
  expect(screen.queryByLabelText('Duration')).toBeNull();
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.type(screen.getByPlaceholderText('Search clients…'), 'ac');
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  const body = api.calls.find((c) => c.method === 'POST')!.body as Record<string, unknown>;
  expect(body).toMatchObject({ status: 'ACTIVE', expectedAmountMinor: 10000000 });
  expect(body).not.toHaveProperty('durationValue');
});

test('D-042 the start date defaults to today and is sent with the new project', async () => {
  const api = stubApi({ 'GET /clients': clients, 'POST /projects': created, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  const start = screen.getByLabelText('Start date');
  expect(start).toHaveValue(new Date().toISOString().slice(0, 10));
  await user.clear(start);
  await user.type(start, '2026-03-15');
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.type(screen.getByPlaceholderText('Search clients…'), 'ac');
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({ startDate: '2026-03-15' });
});

test('D-025 the booking amount is required, and every milestone needs a due date', async () => {
  const api = stubApi({ 'GET /clients': clients, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Project name'), 'Website');
  await user.click(screen.getByRole('button', { name: 'Add milestone' }));
  await user.type(screen.getByLabelText('Milestone 1 task'), 'Design');
  await user.type(screen.getByLabelText('Milestone 1 amount'), '40,000');
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  expect(await screen.findByText('Enter the booking amount')).toBeInTheDocument();
  expect(screen.getByText('Choose a due date')).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
});

test('D-042 editing a project shows and saves its start date, still with no duration', async () => {
  const api = stubApi({ ...projectRoutes, 'PATCH /projects/p9': { body: detail({ id: 'p9' }) } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p9/edit', sessionFor('SALES'));
  const user = userEvent.setup();
  const start = await screen.findByLabelText('Start date');
  expect(start).toHaveValue('2026-09-01');
  expect(screen.queryByLabelText('Duration')).toBeNull();
  await user.clear(start);
  await user.type(start, '2026-08-20');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(api.calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ startDate: '2026-08-20' }));
});

test('D-027 the edit page edits the whole project: client, booking amount and milestones', async () => {
  const other = { ...clients.body.items[0]!, id: 'c2', name: 'Globex' };
  const api = stubApi({
    ...projectRoutes,
    'GET /clients': { body: { ...clients.body, items: [clients.body.items[0], other] } },
    'PATCH /projects/p9': { body: detail({ id: 'p9' }) },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p9/edit', sessionFor('SALES'));
  const user = userEvent.setup();
  expect(await screen.findByRole('combobox', { name: 'Client' })).toHaveTextContent('Acme');
  expect(screen.getByRole('button', { name: 'Edit client details' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit M1' })).toBeInTheDocument();
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.click(await screen.findByRole('option', { name: 'Globex' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(api.calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ clientId: 'c2' }));
});

test('documents chosen on the new project form are uploaded to the project once it exists', async () => {
  const api = stubApi({
    'GET /clients': clients,
    'POST /projects': created,
    ...projectRoutes,
    'POST /projects/p9/documents/upload-url': (req) => ({
      status: 201,
      body: {
        documentId: `d-${(req.body as { name: string }).name}`,
        url: '/api/v1/storage/local/t',
        headers: { 'Content-Type': 'application/pdf' },
      },
    }),
    'PUT /storage/local/t': { body: { ok: true } },
    'POST /documents/d-SOW.pdf/confirm': { body: doc('SOW.pdf', 'SOW') },
    'POST /documents/d-Contract.pdf/confirm': { body: doc('Contract.pdf', 'CONTRACT') },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  await user.upload(screen.getByLabelText(/Add documents/), [
    new File(['%PDF'], 'SOW.pdf', { type: 'application/pdf' }),
    new File(['%PDF'], 'Contract.pdf', { type: 'application/pdf' }),
  ]);
  await choose(user, screen.getByRole('combobox', { name: 'Type of SOW.pdf' }), 'SOW');
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(api.calls.filter((c) => c.path.endsWith('/confirm'))).toHaveLength(2));
  const slots = api.calls.filter((c) => c.path === '/projects/p9/documents/upload-url').map((c) => c.body);
  expect(slots).toEqual([
    expect.objectContaining({ name: 'SOW.pdf', type: 'SOW' }),
    expect.objectContaining({ name: 'Contract.pdf', type: 'CONTRACT' }),
  ]);
});

const doc = (name: string, type: string) => ({
  id: `d-${name}`,
  name,
  type,
  mimeType: 'application/pdf',
  sizeBytes: 4,
  paymentId: null,
  uploadedBy: { id: 'u1', name: 'Test User' },
  createdAt: '2026-10-29T10:00:00.000Z',
});

test('the project currency can be chosen; it follows the client until you pick one', async () => {
  const api = stubApi({ 'GET /clients': clients, 'POST /projects': created, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  const currency = screen.getByRole('combobox', { name: 'Project currency' });
  expect(currency).toHaveTextContent('INR');
  await choose(user, currency, 'USD');
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({ currency: 'USD', clientId: 'c1' });
});

test('creating a project refreshes the dashboard and upcoming invoices, so they never show old numbers', async () => {
  const api = stubApi({ 'GET /clients': clients, 'POST /projects': created, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  const { queryClient } = renderApp('/projects/new', sessionFor('SALES'));
  queryClient.setQueryData(['dashboard', 'period=THIS_FY'], { stale: true });
  queryClient.setQueryData(['invoices', ''], { stale: true });
  const user = userEvent.setup();
  await fillBasics(user);
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(queryClient.getQueryState(['dashboard', 'period=THIS_FY'])?.isInvalidated).toBe(true));
  expect(queryClient.getQueryState(['invoices', ''])?.isInvalidated).toBe(true);
});

test('a server error on create shows as a red pop-up, not inside the form', async () => {
  const api = stubApi({
    'GET /clients': clients,
    'POST /projects': { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong' } } },
    ...projectRoutes,
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  const popup = await screen.findByText('Something went wrong');
  expect(popup.closest('[data-sonner-toast]')).toHaveAttribute('data-type', 'error');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('D-037 a new phase asks whether it is an upsell or part of the original scope', async () => {
  const api = stubApi({
    'GET /clients': clients,
    'GET /clients/c1': { body: { ...clients.body.items[0], contacts: [], projects: [], notes: null, country: null } },
    'POST /projects': created,
    ...projectRoutes,
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new?client=c1&parent=p1&name=Website%20%E2%80%93%20Phase%202', sessionFor('SALES'));
  const user = userEvent.setup();
  const kind = await screen.findByRole('combobox', { name: 'Phase type' });
  expect(kind).toHaveTextContent('Upsell');
  await choose(user, kind, 'SCOPE');
  await user.type(screen.getByLabelText('Booking amount'), '30,000');
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Client' })).toHaveTextContent('Acme'));
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({ parentProjectId: 'p1', phaseKind: 'SCOPE' });
});

test('D-037 an ordinary new project has no phase type', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /clients': clients, ...projectRoutes }).fn);
  renderApp('/projects/new', sessionFor('SALES'));
  await screen.findByLabelText('Booking amount');
  expect(screen.queryByRole('combobox', { name: 'Phase type' })).toBeNull();
});

test('MS-5 milestones adding up to more than the booking amount stop the project from being created', async () => {
  const api = stubApi({ 'GET /clients': clients, 'POST /projects': created, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await fillBasics(user);
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.type(screen.getByPlaceholderText('Search clients…'), 'ac');
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  await user.click(screen.getByRole('button', { name: 'Add milestone' }));
  await user.type(screen.getByLabelText('Milestone 1 task'), 'All');
  await user.type(screen.getByLabelText('Milestone 1 amount'), '1,00,001');
  await user.type(screen.getByLabelText('Milestone 1 due date'), '2026-12-15');
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  expect(
    await screen.findByText('Milestones add up to more than the booking amount. Lower a milestone or raise the booking.'),
  ).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
});

test('D-064 a project billed monthly asks for amount per invoice and invoices; the booking is worked out', async () => {
  const api = stubApi({ 'GET /clients': clients, 'POST /projects': created, ...projectRoutes });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/new', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Project name'), 'Mr Cashback');
  await user.click(screen.getByRole('combobox', { name: 'Client' }));
  await user.type(screen.getByPlaceholderText('Search clients…'), 'ac');
  await user.click(await screen.findByRole('option', { name: 'Acme' }));
  await user.click(screen.getByRole('radio', { name: 'Recurring monthly' }));
  expect(screen.queryByLabelText('Booking amount')).toBeNull();
  await user.type(screen.getByLabelText('Amount per invoice'), '1,000');
  await user.clear(screen.getByLabelText('Number of invoices'));
  await user.type(screen.getByLabelText('Number of invoices'), '12');
  // D-065: one date: the project starts on its first invoice date.
  expect(screen.queryByLabelText('First invoice date')).toBeNull();
  const start = screen.getByLabelText('Start date');
  await user.clear(start);
  await user.type(start, '2026-04-01');
  expect(screen.getByText('The first invoice is raised on the start date, then one on the same day each month.')).toBeInTheDocument();
  expect(screen.getByText(/Booking ₹12,000\.00 \(12 × ₹1,000\.00\)/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
  expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
    expectedAmountMinor: 1200000,
    startDate: '2026-04-01',
    recurring: { amountMinor: 100000, startDate: '2026-04-01', count: 12 },
    milestones: [],
  });
});
