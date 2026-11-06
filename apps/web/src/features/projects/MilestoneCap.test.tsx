import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

// MS-5 (D-044): milestones never add up to more than the project's value (booking + upsells). The fixture has
// ₹1,25,000 of value and ₹1,00,000 in milestones, so ₹25,000 is left.
const routes = {
  'GET /projects/p1': { body: detail() },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /settings': { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
  'GET /payments': { body: { items: [], page: 1, pageSize: 100, total: 0, totalMinor: 0, otherCurrencyPayments: 0 } },
  'POST /projects/p1/milestones': { status: 201, body: detail() },
  'PATCH /milestones/m1': { body: detail() },
};

test('Add milestone says what is left and refuses more than that', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones&add=1', sessionFor('SALES'));
  const user = userEvent.setup();
  expect(await screen.findByText('₹25,000.00 left to put in milestones')).toBeInTheDocument();
  await user.type(screen.getByLabelText('New milestone task'), 'Extra');
  await user.type(screen.getByLabelText('New milestone amount'), '25001');
  await user.type(screen.getByLabelText('New milestone due date'), '2026-12-01');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText(/more than the ₹25,000.00 left/)).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
});

test('editing a milestone above what is left is refused before saving', async () => {
  const api = stubApi(routes);
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Edit M1' }));
  const amount = await screen.findByLabelText('M1 amount');
  await user.clear(amount);
  await user.type(amount, '125001');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(/more than the project's value/)).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false);
});
