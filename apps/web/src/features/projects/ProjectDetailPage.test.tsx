import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderApp, sessionFor, stubApi } from '../../test/render';
import { detail } from './fixtures';

const base = {
  'GET /projects/p1': { body: detail() },
  'GET /projects/p1/documents': { body: { items: [] } },
  'GET /projects/p1/activity': { body: { items: [] } },
  'GET /projects': { body: { items: [], page: 1, pageSize: 100, total: 0 } },
};

test('header shows totals and warns about unscheduled amounts', async () => {
  vi.stubGlobal('fetch', stubApi(base).fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  expect(await screen.findByRole('heading', { name: 'Website Redesign' })).toBeInTheDocument();
  expect(screen.getByText('₹1,25,000.00')).toBeInTheDocument();
  expect(screen.getByText(/₹25,000.00 not yet in milestones/)).toBeInTheDocument();
});

test('a project the user cannot edit shows no edit controls', async () => {
  vi.stubGlobal('fetch', stubApi({ ...base, 'GET /projects/p1': { body: detail({ canEdit: false }) } }).fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  await screen.findByRole('heading', { name: 'Website Redesign' });
  expect(screen.queryByRole('button', { name: /change status/i })).toBeNull();
  expect(screen.queryByRole('link', { name: /edit/i })).toBeNull();
  await userEvent.click(screen.getByRole('tab', { name: 'Upsells' }));
  expect(screen.queryByRole('button', { name: /add upsell amount/i })).toBeNull();
});

test('uploading a document requests a slot, uploads, then confirms', async () => {
  const api = stubApi({
    ...base,
    'POST /projects/p1/documents/upload-url': {
      status: 201,
      body: { documentId: 'd1', url: '/api/v1/storage/local/tok', headers: { 'Content-Type': 'application/pdf' } },
    },
    'PUT /storage/local/tok': { body: { ok: true } },
    'POST /documents/d1/confirm': {
      body: {
        id: 'd1',
        name: 'Proposal.pdf',
        type: 'PROPOSAL',
        mimeType: 'application/pdf',
        sizeBytes: 4,
        uploadedBy: { id: 'u1', name: 'Test User' },
        createdAt: '2026-10-29T10:00:00.000Z',
      },
    },
  });
  vi.stubGlobal('fetch', api.fn);
  renderApp('/projects/p1', sessionFor('SALES'));
  await screen.findByRole('heading', { name: 'Website Redesign' });
  await userEvent.click(screen.getByRole('tab', { name: 'Documents' }));
  const file = new File(['%PDF'], 'Proposal.pdf', { type: 'application/pdf' });
  await userEvent.upload(await screen.findByLabelText('Upload a document'), file);
  await waitFor(() =>
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(
      expect.arrayContaining(['POST /projects/p1/documents/upload-url', 'PUT /storage/local/tok', 'POST /documents/d1/confirm']),
    ),
  );
  const order = api.calls.map((c) => c.path);
  expect(order.indexOf('/projects/p1/documents/upload-url')).toBeLessThan(order.indexOf('/storage/local/tok'));
  expect(order.indexOf('/storage/local/tok')).toBeLessThan(order.indexOf('/documents/d1/confirm'));
});
