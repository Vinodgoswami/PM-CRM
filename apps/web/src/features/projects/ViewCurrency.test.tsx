import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail, listItem } from './fixtures';

// D-067: a project's amounts are shown in the viewer's currency at its rate; edits stay in the project's currency.
const view = { currency: 'USD', rate: '0.012' };
const routes = {
  'GET /projects/p1': { body: { ...detail(), view } },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /settings': { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
  'GET /payments': { body: { items: [], page: 1, pageSize: 100, total: 0, totalMinor: 0, otherCurrencyPayments: 0 } },
};

test('the projects list shows an INR project in dollars', async () => {
  const item = { ...listItem(), currency: 'INR', contractValueMinor: 10000000, view };
  vi.stubGlobal('fetch', stubApi({ 'GET /projects': { body: { items: [item], page: 1, pageSize: 25, total: 1 } } }).fn);
  renderApp('/projects', sessionFor('SALES'));
  const row = (await screen.findByText('Website Redesign')).closest('tr')!;
  expect(within(row).getByText('$1,200.00')).toBeInTheDocument(); // ₹1,00,000 × 0.012
});

test('the project page shows dollars, while editing a milestone stays in rupees', async () => {
  vi.stubGlobal('fetch', stubApi(routes).fn);
  renderApp('/projects/p1?tab=milestones', sessionFor('SALES'));
  const user = userEvent.setup();
  const m1 = (await screen.findByRole('cell', { name: 'M1' })).closest('tr')!;
  expect(within(m1).getAllByText('$1,200.00').length).toBeGreaterThan(0); // amount ₹1,00,000
  await user.click(screen.getByRole('button', { name: 'Edit M1' }));
  expect(screen.getByLabelText('M1 amount')).toHaveValue('100000.00');
  expect(screen.getAllByText('INR').length).toBeGreaterThan(0);
});
