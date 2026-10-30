import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { choose, renderApp, sessionFor, stubApi } from '../../test/render';

const users = { items: [{ id: 'u1', name: 'Test User', email: 'test@example.com', role: 'ADMIN', active: true, lastLoginAt: null }] };
const base = { 'GET /users': { body: users }, 'GET /users/invites': { body: { items: [] } } };

async function inviteSomeone(emailed: boolean) {
  vi.stubGlobal(
    'fetch',
    stubApi({
      ...base,
      'POST /users/invite': {
        status: 201,
        body: { url: 'http://localhost:5173/invite/abc', expiresAt: '2026-11-02T10:00:00.000Z', emailed },
      },
    }).fn,
  );
  renderApp('/users', sessionFor('ADMIN'));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /invite user/i }));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Name'), 'Vikram Shah');
  await user.type(within(dialog).getByLabelText('Email'), 'vikram@x.test');
  await choose(user, within(dialog).getByLabelText('Role'), 'CEO');
  await user.click(within(dialog).getByRole('button', { name: /send invite|invite/i }));
  return dialog;
}

test('after inviting, it says the invite was emailed, and the link is still there to copy', async () => {
  const dialog = await inviteSomeone(true);
  expect(await within(dialog).findByRole('status')).toHaveTextContent('Invite emailed to vikram@x.test.');
  expect(within(dialog).getByDisplayValue('http://localhost:5173/invite/abc')).toBeInTheDocument();
});

test('when email is not set up or fails, it says to share the link by hand', async () => {
  const dialog = await inviteSomeone(false);
  expect(await within(dialog).findByRole('status')).toHaveTextContent(
    'Not emailed. Copy the link below and send it to vikram@x.test yourself.',
  );
});
