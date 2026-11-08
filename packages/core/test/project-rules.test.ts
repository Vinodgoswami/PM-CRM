import { describe, expect, test } from 'vitest';
import { endDateFor } from '../src/duration';
import { ALLOWED_TRANSITIONS, checkTransition, type ProjectStatus, statusDates } from '../src/project-status';
import { projectTotals } from '../src/project-totals';
import { wouldCreateCycle } from '../src/upsell';

const dated = [{ dueDate: '2026-11-01' }];
const sales = { isAdmin: false, milestones: dated, hasPayments: false };

describe('PS-1 transitions', () => {
  const pairs: [ProjectStatus, ProjectStatus][] = [
    ['LEAD', 'PROPOSAL'],
    ['LEAD', 'LOST'],
    ['PROPOSAL', 'WON'],
    ['PROPOSAL', 'LOST'],
    ['WON', 'ACTIVE'],
    ['WON', 'LOST'],
    ['ACTIVE', 'COMPLETED'],
    ['ACTIVE', 'ON_HOLD'],
    ['ON_HOLD', 'ACTIVE'],
  ];
  test('the documented arrows are exactly the allowed set', () => {
    const all = Object.entries(ALLOWED_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => [from, to]));
    expect(all.sort()).toEqual(pairs.map((p) => [...p]).sort());
  });
  test.each(pairs)('PS-1 %s → %s is allowed', (from, to) => {
    expect(checkTransition(from, to, sales)).toEqual({ ok: true });
  });
  test('PS-1 skipping a step is refused for Sales', () => {
    expect(checkTransition('LEAD', 'ACTIVE', sales)).toMatchObject({ ok: false, rule: 'PS-1' });
  });
  test('PS-1 Admin may move any status', () => {
    expect(checkTransition('LEAD', 'ACTIVE', { ...sales, isAdmin: true })).toEqual({ ok: true });
    expect(checkTransition('COMPLETED', 'ACTIVE', { ...sales, isAdmin: true })).toEqual({ ok: true });
  });
  test('PS-1 staying in the same status is not a transition', () => {
    expect(checkTransition('ACTIVE', 'ACTIVE', sales)).toMatchObject({ ok: false, rule: 'PS-1' });
  });
});

test('PS-4 ACTIVE needs every milestone dated; none at all is fine (D-045)', () => {
  expect(checkTransition('WON', 'ACTIVE', { ...sales, milestones: [] })).toEqual({ ok: true });
  expect(checkTransition('WON', 'ACTIVE', { ...sales, milestones: [{ dueDate: '2026-11-01' }, { dueDate: null }] })).toMatchObject({
    ok: false,
    rule: 'PS-4',
  });
  expect(checkTransition('LEAD', 'ACTIVE', { isAdmin: true, milestones: [{ dueDate: null }], hasPayments: false })).toMatchObject({
    rule: 'PS-4',
  });
});

test('PS-6 LOST is refused while payments exist', () => {
  expect(checkTransition('WON', 'LOST', { ...sales, hasPayments: true })).toMatchObject({ ok: false, rule: 'PS-6' });
});

describe('PS-2 status dates', () => {
  const empty = { wonAt: null, closedAt: null };
  test('entering WON sets wonAt to today', () => {
    expect(statusDates('PROPOSAL', 'WON', empty, '2026-10-29')).toEqual({ wonAt: '2026-10-29', closedAt: null });
  });
  test('wonAt is kept once set', () => {
    expect(statusDates('WON', 'ACTIVE', { wonAt: '2026-09-01', closedAt: null }, '2026-10-29').wonAt).toBe('2026-09-01');
  });
  test('ACTIVE without a prior WON sets wonAt', () => {
    expect(statusDates('LEAD', 'ACTIVE', empty, '2026-10-29').wonAt).toBe('2026-10-29');
  });
  test('closing sets closedAt and reopening clears it', () => {
    expect(statusDates('ACTIVE', 'COMPLETED', { wonAt: '2026-01-01', closedAt: null }, '2026-10-29').closedAt).toBe('2026-10-29');
    expect(statusDates('COMPLETED', 'ACTIVE', { wonAt: '2026-01-01', closedAt: '2026-10-29' }, '2026-10-30').closedAt).toBeNull();
  });
});

test('D-1 endDateFor clamps month ends and handles weeks', () => {
  expect(endDateFor('2026-01-31', 1, 'MONTHS')).toBe('2026-02-28');
  expect(endDateFor('2026-01-31', 2, 'WEEKS')).toBe('2026-02-14');
  expect(endDateFor('2026-11-15', 3, 'MONTHS')).toBe('2027-02-15');
  expect(endDateFor(null, 3, 'MONTHS')).toBeNull();
  expect(endDateFor('2026-01-01', null, null)).toBeNull();
});

test('projectTotals follows docs/05 derived values', () => {
  const totals = projectTotals(
    {
      expectedAmountMinor: 100000n,
      upsellEntries: [{ amountMinor: 20000n }],
      milestones: [
        { amountMinor: 50000n, dueDate: '2026-09-01', paidMinor: 50000n },
        { amountMinor: 40000n, dueDate: '2026-10-01', paidMinor: 10000n },
        { amountMinor: 30000n, dueDate: '2026-12-01', paidMinor: 0n },
      ],
    },
    '2026-10-29',
  );
  expect(totals).toEqual({
    contractValueMinor: 120000n,
    scheduledMinor: 120000n,
    unscheduledMinor: 0n,
    collectedMinor: 60000n,
    // D-061: everything still to be paid on the contract, due or not.
    outstandingMinor: 60000n,
    nextDueDate: '2026-12-01',
    hasOverdue: true,
  });
});

test('projectTotals with no milestones', () => {
  expect(projectTotals({ expectedAmountMinor: 5000n, upsellEntries: [], milestones: [] }, '2026-10-29')).toEqual({
    contractValueMinor: 5000n,
    scheduledMinor: 0n,
    unscheduledMinor: 5000n,
    collectedMinor: 0n,
    outstandingMinor: 5000n,
    nextDueDate: null,
    hasOverdue: false,
  });
});

test('D-061 work not confirmed (enquiry, quote, cancelled) has nothing outstanding; overpaid never goes below 0', () => {
  const p = { expectedAmountMinor: 5000n, upsellEntries: [], milestones: [] };
  expect(projectTotals({ ...p, booked: false }, '2026-10-29').outstandingMinor).toBe(0n);
  const over = { ...p, milestones: [{ amountMinor: 6000n, dueDate: '2026-09-01', paidMinor: 6000n }] };
  expect(projectTotals(over, '2026-10-29').outstandingMinor).toBe(0n);
});

test('U-2 wouldCreateCycle detects loops through ancestors', () => {
  const parents: Record<string, string | null> = { A: null, B: 'A', C: 'B' };
  const parentOf = (id: string) => parents[id] ?? null;
  expect(wouldCreateCycle('A', 'C', parentOf)).toBe(true); // A under C, but C descends from A
  expect(wouldCreateCycle('A', 'A', parentOf)).toBe(true);
  expect(wouldCreateCycle('C', 'A', parentOf)).toBe(false);
  expect(wouldCreateCycle('D', 'C', parentOf)).toBe(false);
});

test('PS-1 / PS-6 messages use on-screen stage names, not stored codes', () => {
  const ctx = { isAdmin: false, milestones: [], hasPayments: false };
  expect(checkTransition('WON', 'WON', ctx)).toMatchObject({ message: 'The project is already Confirmed.' });
  expect(checkTransition('LEAD', 'COMPLETED', ctx)).toMatchObject({ message: 'A project cannot move from Enquiry to Completed.' });
  expect(checkTransition('WON', 'LOST', { ...ctx, hasPayments: true })).toMatchObject({
    message: 'This project has payments. Reverse them before cancelling it.',
  });
});
