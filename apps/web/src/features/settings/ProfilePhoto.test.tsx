import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';

const withPhoto = () => {
  const s = sessionFor('ADMIN');
  return { ...s, user: { ...s.user, avatarUrl: '/api/v1/users/u1/avatar?v=abc' } };
};

test('without a photo the profile shows initials and offers to add one', async () => {
  vi.stubGlobal('fetch', stubApi({}).fn);
  renderApp('/profile', sessionFor('ADMIN'));
  const photo = await screen.findByRole('region', { name: 'Profile photo' });
  expect(within(photo).getByText('TU')).toBeInTheDocument();
  expect(within(photo).getByLabelText('Change photo')).toBeInTheDocument();
  expect(within(photo).queryByRole('button', { name: 'Remove photo' })).toBeNull();
});

test('choosing an image uploads it and the new photo appears on the profile and in the top bar', async () => {
  const api = stubApi({
    'POST /me/avatar/upload-url': {
      status: 201,
      body: { key: 'avatars/u1/k1', url: '/api/v1/storage/local/tok', headers: { 'Content-Type': 'image/png' } },
    },
    'PUT /storage/local/tok': { status: 200 },
    'POST /me/avatar': { body: { avatarUrl: '/api/v1/users/u1/avatar?v=k1' } },
    'GET /auth/session': { body: { ...withPhoto(), user: { ...withPhoto().user, avatarUrl: '/api/v1/users/u1/avatar?v=k1' } } },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/profile', sessionFor('ADMIN'));
  const user = userEvent.setup();
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'me.png', { type: 'image/png' });
  await user.upload(await screen.findByLabelText('Change photo'), file);
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === 'POST' && c.path === '/me/avatar')?.body).toEqual({ key: 'avatars/u1/k1' }),
  );
  expect(api.calls.find((c) => c.method === 'POST' && c.path === '/me/avatar/upload-url')?.body).toEqual({
    mimeType: 'image/png',
    sizeBytes: 4,
  });
  await waitFor(() =>
    expect(screen.getAllByRole('img', { name: 'Test User' }).every((i) => i.getAttribute('src')?.endsWith('v=k1'))).toBe(true),
  );
  expect(screen.getAllByRole('img', { name: 'Test User' }).length).toBeGreaterThanOrEqual(2); // profile and top bar
});

test('files that are not small images are refused before uploading', async () => {
  const api = stubApi({});
  vi.stubGlobal('fetch', api.fn);
  renderApp('/profile', sessionFor('ADMIN'));
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(await screen.findByLabelText('Change photo'), new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }));
  expect(await screen.findByText('Use a JPEG, PNG or WebP image up to 2 MB.')).toBeInTheDocument();
  expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
});

test('a photo can be removed', async () => {
  const api = stubApi({ 'DELETE /me/avatar': { status: 204 }, 'GET /auth/session': { body: sessionFor('ADMIN') } });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/profile', withPhoto());
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Remove photo' }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/me/avatar')).toBe(true));
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Profile photo' })).getByText('TU')).toBeInTheDocument());
});
