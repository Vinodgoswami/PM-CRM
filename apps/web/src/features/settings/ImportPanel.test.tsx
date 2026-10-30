import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';

const settings = { companyName: 'Acme CRM', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 };
const preview = {
  projects: 2,
  newClients: 1,
  existingClients: 1,
  milestones: 3,
  payments: 2,
  errors: [],
  sample: [
    {
      line: 2,
      client: 'Acme',
      clientExists: true,
      name: 'Website',
      status: 'ACTIVE',
      currency: 'INR',
      expectedAmountMinor: 10000000,
      milestones: 2,
      paidMinor: 6500000,
    },
    {
      line: 4,
      client: 'Bluepeak',
      clientExists: false,
      name: 'Audit',
      status: 'LEAD',
      currency: 'INR',
      expectedAmountMinor: 3000000,
      milestones: 0,
      paidMinor: 0,
    },
  ],
};
const file = () => new File(['client,project,expected_amount\nAcme,Website,100000\n'], 'projects.csv', { type: 'text/csv' });

async function openImport() {
  const user = userEvent.setup();
  renderApp('/settings', sessionFor('CEO'));
  await user.click(await screen.findByRole('tab', { name: 'Import data' }));
  return user;
}

test('choosing a file previews it, then Import creates the projects', async () => {
  const api = stubApi({
    'GET /settings': { body: settings },
    'POST /imports/preview': { body: preview },
    'POST /imports': { status: 201, body: { projects: 2, newClients: 1, milestones: 3, payments: 2 } },
  });
  vi.stubGlobal('fetch', api.fn);
  const user = await openImport();
  await user.upload(screen.getByLabelText('CSV file'), file());
  const summary = await screen.findByRole('region', { name: 'Import preview' });
  expect(summary).toHaveTextContent('2 projects');
  expect(summary).toHaveTextContent('1 new client');
  expect(within(summary).getByText('Website').closest('tr')).toHaveTextContent('₹65,000.00');
  expect(api.calls.find((c) => c.path === '/imports/preview')!.body).toEqual({
    csv: 'client,project,expected_amount\nAcme,Website,100000\n',
  });

  await user.click(screen.getByRole('button', { name: 'Import 2 projects' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Imported 2 projects, 1 new client, 3 milestones and 2 payments.');
});

test('problems are listed by line and block the import', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /settings': { body: settings },
      'POST /imports/preview': { body: { ...preview, errors: [{ line: 3, message: 'P-6: paid_date 2026-12-01 is in the future.' }] } },
    }).fn,
  );
  const user = await openImport();
  await user.upload(screen.getByLabelText('CSV file'), file());
  const problems = await screen.findByRole('alert');
  expect(problems).toHaveTextContent('Line 3: P-6: paid_date 2026-12-01 is in the future.');
  expect(screen.queryByRole('button', { name: /^Import \d/ })).toBeNull();
});

test('a template with every column can be downloaded', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /settings': { body: settings } }).fn);
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    blobs.push(b as Blob);
    return 'blob:x';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const user = await openImport();
  await user.click(screen.getByRole('button', { name: 'Download template' }));
  await waitFor(() => expect(blobs).toHaveLength(1));
  expect((await blobs[0]!.text()).split('\n')[0]).toContain('client,client_email,project,status,expected_amount');
});
