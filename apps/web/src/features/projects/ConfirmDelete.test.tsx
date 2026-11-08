import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

// D-060: every delete asks first in the app's own popup, with Delete and Cancel.
const twoMilestones = () => {
  const d = detail();
  d.milestones = [d.milestones[0]!, { ...d.milestones[0]!, id: 'm2', number: 2, title: 'Build', paidMinor: 0, balanceMinor: 5000000 }];
  return d;
};
const routes = {
  'GET /projects/p1': { body: twoMilestones() },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /settings': { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
  'GET /payments': { body: { items: [], page: 1, pageSize: 100, total: 0, totalMinor: 0, otherCurrencyPayments: 0 } },
  'DELETE /milestones/m2': { body: detail() },
  'DELETE /projects/p1/upsells/u1': { status: 204 },
};

test('deleting a milestone asks first: Cancel keeps it, Delete removes it', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  const native = vi.spyOn(window, 'confirm');
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Delete M2' }));
  let dialog = await screen.findByRole('alertdialog', { name: 'Delete M2?' });
  expect(dialog).toHaveTextContent('Do you really want to delete M2 Build?');
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);

  await user.click(screen.getByRole('button', { name: 'Delete M2' }));
  dialog = await screen.findByRole('alertdialog', { name: 'Delete M2?' });
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/milestones/m2')).toBe(true));
  expect(native).not.toHaveBeenCalled();
});

test('removing an upsell amount asks first', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=upsells', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Remove extra work amount' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete upsell amount?' });
  expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/projects/p1/upsells/u1')).toBe(true));
});
