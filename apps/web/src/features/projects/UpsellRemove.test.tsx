import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

// D-059: a refused upsell removal shows why, instead of silently doing nothing.
test('a refused upsell removal shows the reason', async () => {
  vi.stubGlobal(
    'fetch',
    stubApi({
      'GET /projects/p1': { body: detail() },
      'GET /projects/p1/documents': { body: { items: [] } },
      'GET /projects/p1/activity': { body: { items: [] } },
      'GET /settings': { body: { companyName: '', baseCurrency: 'INR', fyStartMonth: 4, timezone: 'Asia/Kolkata', dueSoonDays: 7 } },
      'DELETE /projects/p1/upsells/u1': {
        status: 400,
        body: {
          error: { code: 'RULE_VIOLATION', message: 'Without this upsell, milestones would add up to more.', details: { rule: 'MS-5' } },
        },
      },
    }).fn,
  );
  renderApp('/projects/p1?tab=upsells', sessionFor('SALES'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Remove extra work amount' }));
  expect(await screen.findByText('Without this upsell, milestones would add up to more.')).toBeInTheDocument();
});
