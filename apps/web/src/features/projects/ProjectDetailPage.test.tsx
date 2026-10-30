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
  await userEvent.click(screen.getByRole('tab', { name: 'Phases & upsell' }));
  expect(screen.queryByRole('button', { name: /add extra work amount/i })).toBeNull();
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

test('the open tab lives in the address, so it survives the project reloading', async () => {
  vi.stubGlobal('fetch', stubApi(base).fn);
  const { router, queryClient } = renderApp('/projects/p1?tab=payments', sessionFor('CEO'));
  expect(await screen.findByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
  await userEvent.click(screen.getByRole('tab', { name: 'Milestones' }));
  expect(router.state.location.search).toBe('?tab=milestones');
  // A payment or reversal drops the cached project; the page reloads it and must stay on the same tab.
  await queryClient.resetQueries({ queryKey: ['projects'] });
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Milestones' })).toHaveAttribute('aria-selected', 'true'));
});

test('D-025 an active project is finished with one clear button', async () => {
  const api = stubApi({
    ...base,
    'GET /projects/p1': { body: detail({ status: 'ACTIVE' }) },
    'POST /projects/p1/status': { body: detail({ status: 'COMPLETED' }) },
  });
  vi.stubGlobal('fetch', api.fn);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderApp('/projects/p1', sessionFor('SALES'));
  await userEvent.click(await screen.findByRole('button', { name: 'Mark as completed' }));
  await waitFor(() => expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ status: 'COMPLETED' }));
});

test('D-028 the Phases & upsell tab splits the booking: initial + upsell = total, and adds the next phase', async () => {
  const phased = detail({
    phase: 1,
    upsellProjects: [
      {
        id: 'p2',
        code: 'PRJ-0002',
        name: 'Website phase 2',
        status: 'ACTIVE',
        phase: 2,
        expectedAmountMinor: 3000000,
        contractValueMinor: 3000000,
        collectedMinor: 1000000,
      },
    ],
  });
  vi.stubGlobal('fetch', stubApi({ ...base, 'GET /projects/p1': { body: phased } }).fn);
  renderApp('/projects/p1?tab=upsells', sessionFor('SALES'));
  const summary = await screen.findByRole('region', { name: 'Booking split' });
  // Initial ₹1,00,000 + upsell (₹25,000 extra work + ₹30,000 phase 2) = ₹1,55,000
  expect(summary).toHaveTextContent('Initial booking₹1,00,000.00');
  expect(summary).toHaveTextContent('Upsell₹55,000.00');
  expect(summary).toHaveTextContent('Total booking₹1,55,000.00');
  expect(screen.getByRole('link', { name: /Phase 2.*Website phase 2/ })).toHaveAttribute('href', '/projects/p2');
  expect(screen.getByRole('link', { name: 'Add Phase 3' }).getAttribute('href')).toContain('parent=p1');
});

test('D-028 a phase points back to its original project', async () => {
  const child = detail({ id: 'p1', phase: 2, parent: { id: 'p0', code: 'PRJ-0000', name: 'Website' }, upsellEntries: [] });
  vi.stubGlobal('fetch', stubApi({ ...base, 'GET /projects/p1': { body: child } }).fn);
  renderApp('/projects/p1?tab=upsells', sessionFor('SALES'));
  expect(await screen.findByRole('link', { name: /Phase 2 of PRJ-0000 Website/ })).toHaveAttribute('href', '/projects/p0');
});
