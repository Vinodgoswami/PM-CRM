import { todayIn } from '@salescrm/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { choose, renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

const settings = { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } };
const payment = {
  id: 'pay1',
  milestoneId: 'm1',
  milestoneLabel: 'M1',
  invoiceId: 'INV-9',
  paymentDate: '2026-10-05',
  amountMinor: 5000000,
  reversesPaymentId: null,
  reversedById: null,
  note: null,
  createdBy: { id: 'u1', name: 'Test User' },
  createdAt: '2026-10-05T10:00:00.000Z',
  canEdit: true,
  project: { id: 'p1', code: 'PRJ-0001', name: 'Website Redesign', currency: 'INR' },
  client: { id: 'c1', name: 'Acme' },
};
const routes = {
  'GET /projects/p1': { body: detail() },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /settings': settings,
  'GET /payments': { body: { items: [payment], page: 1, pageSize: 100, total: 1, totalMinor: 5000000, otherCurrencyPayments: 0 } },
};

async function openMarkPaid() {
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Milestones' }));
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  return user;
}

test('the Mark-as-paid dialog is pre-filled with the label, today and the balance', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  await openMarkPaid();
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('Milestone')).toHaveValue('M1');
  expect(within(dialog).getByLabelText('Payment date')).toHaveValue(todayIn('Asia/Kolkata', new Date()));
  expect(within(dialog).getByLabelText('Amount')).toHaveValue('50000.00');
  expect(within(dialog).getByText("The amount can't be changed after saving.")).toBeInTheDocument();
});

test('saving sends one request with an Idempotency-Key, even on a double click', async () => {
  const api = stubApi({
    ...routes,
    'POST /milestones/m1/payments': { status: 201, body: { ...payment, id: 'pay2' } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = await openMarkPaid();
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Invoice ID'), 'INV-200');
  await user.dblClick(within(dialog).getByRole('button', { name: 'Save payment' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const posts = api.calls.filter((c) => c.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0]!.headers.get('Idempotency-Key')).toMatch(/.{8,}/);
  expect(posts[0]!.body).toMatchObject({ milestoneLabel: 'M1', invoiceId: 'INV-200', amountMinor: 5000000 });
});

test('a server rule violation is shown in the dialog', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({
      ...routes,
      'POST /milestones/m1/payments': {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The amount is more than what is left to pay on this milestone.',
            details: { rule: 'P-2' },
          },
        },
      },
    }).fn,
  );
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = await openMarkPaid();
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save payment' }));
  expect(await screen.findByText('The amount is more than what is left to pay on this milestone.')).toBeInTheDocument();
});

test('only an Admin can reverse, and a reason is required', async () => {
  const api = stubApi({
    ...routes,
    'POST /payments/pay1/reverse': { status: 201, body: { ...payment, id: 'rev', amountMinor: -5000000 } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Payments' }));
  await screen.findByText('INV-9');
  expect(screen.queryByRole('button', { name: /reverse/i })).toBeNull();
});

test('Admin reversal needs a reason', async () => {
  const api = stubApi({
    ...routes,
    'POST /payments/pay1/reverse': { status: 201, body: { ...payment, id: 'rev', amountMinor: -5000000 } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1', sessionFor('CEO'));
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Payments' }));
  await user.click(await screen.findByRole('button', { name: 'Reverse payment INV-9' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reverse payment' }));
  expect(await screen.findByText('Give a reason for the reversal')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Reason'), 'Wrong invoice');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reverse payment' }));
  await waitFor(() => expect(api.calls.some((c) => c.path === '/payments/pay1/reverse')).toBe(true));
  expect(api.calls.find((c) => c.path === '/payments/pay1/reverse')!.body).toEqual({ reason: 'Wrong invoice' });
});

test('without edit rights there is no Mark as paid and no Add milestone', async () => {
  vi.stubGlobal('fetch', stubApi({ ...routes, 'GET /projects/p1': { body: detail({ canEdit: false }) } }).fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Milestones' }));
  await screen.findByText('Design');
  expect(screen.queryByRole('button', { name: /mark .* as paid/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /add milestone/i })).toBeNull();
});

test('P-8 no Mark as paid on work that is not won yet', async () => {
  vi.stubGlobal('fetch', stubApi({ ...routes, 'GET /projects/p1': { body: detail({ status: 'PROPOSAL' }) } }).fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Milestones' }));
  await screen.findByText('Design');
  expect(screen.queryByRole('button', { name: /mark .* as paid/i })).toBeNull();
});

const slipRoutes = {
  'POST /projects/p1/documents/upload-url': {
    status: 201,
    body: { documentId: 'd9', url: '/api/v1/storage/local/slip', headers: { 'Content-Type': 'application/pdf' } },
  },
  'PUT /storage/local/slip': { body: { ok: true } },
  'POST /documents/d9/confirm': {
    body: {
      id: 'd9',
      name: 'INV-200.pdf',
      type: 'INVOICE',
      mimeType: 'application/pdf',
      sizeBytes: 4,
      paymentId: 'pay2',
      uploadedBy: { id: 'u1', name: 'Test User' },
      createdAt: '2026-10-29T10:00:00.000Z',
    },
  },
};

test('D-043 an invoice chosen in the dialog is only read: the payment is saved and the file is not stored', async () => {
  const api = stubApi({ ...routes, ...slipRoutes, 'POST /milestones/m1/payments': { status: 201, body: { ...payment, id: 'pay2' } } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = await openMarkPaid();
  const dialog = await screen.findByRole('dialog');
  await user.upload(within(dialog).getByLabelText(/Invoice or payment slip/), new File(['%PDF'], 'INV-200.png', { type: 'image/png' }));
  expect(within(dialog).getByText('INV-200.png')).toBeInTheDocument();
  expect(within(dialog).getByText(/read here, not stored/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Save payment' }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(api.calls.some((c) => c.path === '/milestones/m1/payments')).toBe(true);
  expect(api.calls.some((c) => c.path.includes('/documents'))).toBe(false);
});

test('D-026 a file type that cannot be stored is refused before saving', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = userEvent.setup({ applyAccept: false });
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await user.click(screen.getByRole('tab', { name: 'Milestones' }));
  await user.click(await screen.findByRole('button', { name: 'Mark M1 as paid' }));
  const dialog = await screen.findByRole('dialog');
  await user.upload(
    within(dialog).getByLabelText(/Invoice or payment slip/),
    new File(['x'], 'run.exe', { type: 'application/x-msdownload' }),
  );
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Use PDF, Office, PNG, JPG or ZIP');
  expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
});

test('D-026 the Payments tab lists stored slips and lets you attach one later', async () => {
  const api = stubApi({
    ...routes,
    ...slipRoutes,
    'GET /payments': {
      body: {
        items: [{ ...payment, id: 'pay2', documents: [{ id: 'd1', name: 'Receipt.png' }] }],
        page: 1,
        pageSize: 100,
        total: 1,
        totalMinor: 5000000,
        otherCurrencyPayments: 0,
      },
    },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=payments', sessionFor('SALES'));
  expect(await screen.findByRole('button', { name: 'Download Receipt.png' })).toBeInTheDocument();
  await userEvent.upload(
    screen.getByLabelText('Attach invoice or slip to INV-9'),
    new File(['%PDF'], 'INV-200.pdf', { type: 'application/pdf' }),
  );
  await waitFor(() =>
    expect(api.calls.find((c) => c.path === '/projects/p1/documents/upload-url')?.body).toMatchObject({ paymentId: 'pay2' }),
  );
});

test('D-026 a slip can be dropped onto the dialog and removed again', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  const user = await openMarkPaid();
  const dialog = await screen.findByRole('dialog');
  const file = new File(['%PDF'], 'Bank slip.pdf', { type: 'application/pdf' });
  fireEvent.drop(within(dialog).getByTestId('slip-dropzone'), { dataTransfer: { files: [file] } });
  expect(within(dialog).getByText('Bank slip.pdf')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Remove Bank slip.pdf' }));
  expect(within(dialog).getByText('Choose a file')).toBeInTheDocument();
});

test('opening the Milestones tab with ?edit= starts that milestone in edit mode', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/projects/p1?tab=milestones&edit=m1', sessionFor('SALES'));
  expect(await screen.findByLabelText('M1 task')).toBeInTheDocument();
});

test('D-027 changing the amount of a paid milestone asks to reset its payments first', async () => {
  const api = stubApi({
    ...routes,
    'POST /milestones/m1/reset-payments': { body: { reversed: 1 } },
    'PATCH /milestones/m1': { body: detail() },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones&edit=m1', sessionFor('SALES'));
  const user = userEvent.setup();
  const amount = await screen.findByLabelText('M1 amount');
  await user.clear(amount);
  await user.type(amount, '80,000');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  const dialog = await screen.findByRole('dialog', { name: 'Reset paid milestone?' });
  expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false);
  await user.type(within(dialog).getByLabelText('Reason'), 'Scope cut');
  await user.click(within(dialog).getByRole('button', { name: 'Reset and save' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
  const paths = api.calls.map((c) => `${c.method} ${c.path}`);
  expect(paths.indexOf('POST /milestones/m1/reset-payments')).toBeLessThan(paths.indexOf('PATCH /milestones/m1'));
  expect(api.calls.find((c) => c.path === '/milestones/m1/reset-payments')!.body).toEqual({ reason: 'Scope cut' });
  expect(api.calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ amountMinor: 8000000 });
});

test('D-027 renaming a paid milestone needs no reset', async () => {
  const api = stubApi({ ...routes, 'PATCH /milestones/m1': { body: detail() } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones&edit=m1', sessionFor('SALES'));
  const user = userEvent.setup();
  const task = await screen.findByLabelText('M1 task');
  await user.type(task, ' v2');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(api.calls.some((c) => c.path.endsWith('/reset-payments'))).toBe(false);
});

const withPhases = detail({
  phase: 1,
  milestones: [{ ...detail().milestones[0]!, isUpsell: true }],
  upsellProjects: [
    {
      id: 'p2',
      code: 'PRJ-0002',
      name: 'Website phase 2',
      status: 'ACTIVE',
      phase: 2,
      phaseKind: 'SCOPE',
      expectedAmountMinor: 100,
      contractValueMinor: 100,
      collectedMinor: 0,
    },
  ],
});

test('D-038 an upsell milestone carries an Upsell badge', async () => {
  vi.stubGlobal('fetch', stubApi({ ...routes, 'GET /projects/p1': { body: withPhases } }).fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const row = (await screen.findByText('Design')).closest('tr')!;
  expect(within(row).getByText('Upsell')).toBeInTheDocument();
});

test('D-038 adding a milestone asks for its phase and whether it is an upsell', async () => {
  const api = stubApi({
    ...routes,
    'GET /projects/p1': { body: withPhases },
    'POST /projects/p1/upsells': { status: 201, body: withPhases },
    'POST /projects/p2/milestones': { status: 201, body: detail({ id: 'p2' }) },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones&add=1', sessionFor('SALES'));
  const user = userEvent.setup();
  // Opened straight away by the Phases section's "+ Milestone" link (?add=1).
  await user.type(await screen.findByLabelText('New milestone task'), 'Computer vision');
  await user.type(screen.getByLabelText('New milestone amount'), '400');
  await user.type(screen.getByLabelText('New milestone due date'), '2026-12-20');
  await choose(user, screen.getByRole('combobox', { name: 'Milestone type' }), 'UPSELL');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.path === '/projects/p1/upsells')?.body).toMatchObject({
      amountMinor: 40000,
      note: 'Computer vision',
      dueDate: '2026-12-20',
    }),
  );

  await user.type(screen.getByLabelText('New milestone task'), 'Phase two part');
  await user.type(screen.getByLabelText('New milestone amount'), '100');
  await user.type(screen.getByLabelText('New milestone due date'), '2026-12-21');
  await choose(user, screen.getByRole('combobox', { name: 'Milestone phase' }), 'p2');
  await choose(user, screen.getByRole('combobox', { name: 'Milestone type' }), 'CONTRACT');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(api.calls.find((c) => c.path === '/projects/p2/milestones')?.body).toMatchObject({ title: 'Phase two part' }));
});
