import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';

// D-021: company settings — the Admin renames the company; the rest is the CEO's.
const settings = { companyName: 'ChicMic Studios', baseCurrency: 'USD', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 };

test('the Admin edits the company name; currency and financial year are shown as the CEO’s', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /settings': { body: settings }, 'GET /users': { body: { items: [] } } }).fn);
  renderApp('/settings', sessionFor('ADMIN'));
  expect(await screen.findByLabelText('Company name')).toBeEnabled();
  expect(screen.getByLabelText('Base currency')).toBeDisabled();
  expect(screen.getByLabelText('Financial year starts in')).toBeDisabled();
  expect(screen.getByText('Currency, financial year, time zone and due-soon days are set by the CEO.')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Import data' })).toBeNull();
});

test('the CEO has company settings and the import', async () => {
  vi.stubGlobal('fetch', stubApi({ 'GET /settings': { body: settings }, 'GET /users': { body: { items: [] } } }).fn);
  renderApp('/settings', sessionFor('CEO'));
  expect(await screen.findByLabelText('Base currency')).toBeEnabled();
  expect(screen.getByRole('tab', { name: 'Import data' })).toBeInTheDocument();
});
