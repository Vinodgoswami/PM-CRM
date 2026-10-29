import { describe, expect, test } from 'vitest';
import { invoiceGroup } from '../src/invoice-groups';
import { milestoneStatus } from '../src/milestone-status';
import { checkPayment } from '../src/payments';

const TODAY = '2026-10-29';
const m = (amountMinor: bigint, paidMinor: bigint, dueDate: string | null) => ({ amountMinor, paidMinor, dueDate });

describe('MS-3 milestone status', () => {
  test.each([
    ['paid in full', m(100n, 100n, '2026-10-01'), 'PAID'],
    ['paid even though past due', m(100n, 100n, '2020-01-01'), 'PAID'],
    ['overdue and unpaid', m(100n, 0n, '2026-10-28'), 'OVERDUE'],
    ['overdue beats partial', m(100n, 40n, '2026-10-28'), 'OVERDUE'],
    ['partial, not yet due', m(100n, 40n, '2026-12-01'), 'PARTIALLY_PAID'],
    ['due today', m(100n, 0n, '2026-10-29'), 'DUE_SOON'],
    ['due exactly at the due-soon edge', m(100n, 0n, '2026-11-05'), 'DUE_SOON'],
    ['one day past the edge', m(100n, 0n, '2026-11-06'), 'SCHEDULED'],
    ['no due date', m(100n, 0n, null), 'UNSCHEDULED'],
    ['partial without a due date', m(100n, 40n, null), 'PARTIALLY_PAID'],
  ] as const)('MS-3 %s', (_name, milestone, expected) => {
    expect(milestoneStatus(milestone, TODAY, 7)).toBe(expected);
  });
});

describe('P-2 / P-6 payment checks', () => {
  const milestone = { amountMinor: 1000n, paidMinor: 400n };
  test('P-2 paying exactly the balance is fine', () => {
    expect(checkPayment({ amountMinor: 600n, paymentDate: TODAY }, milestone, TODAY)).toEqual({ ok: true });
  });
  test('P-2 more than the balance is refused', () => {
    expect(checkPayment({ amountMinor: 601n, paymentDate: TODAY }, milestone, TODAY)).toMatchObject({ ok: false, rule: 'P-2' });
  });
  test('P-2 zero or negative is refused', () => {
    expect(checkPayment({ amountMinor: 0n, paymentDate: TODAY }, milestone, TODAY)).toMatchObject({ ok: false, rule: 'P-2' });
    expect(checkPayment({ amountMinor: -5n, paymentDate: TODAY }, milestone, TODAY)).toMatchObject({ ok: false, rule: 'P-2' });
  });
  test('P-6 a future payment date is refused', () => {
    expect(checkPayment({ amountMinor: 100n, paymentDate: '2026-10-30' }, milestone, TODAY)).toMatchObject({ ok: false, rule: 'P-6' });
  });
});

describe('invoice groups (S2)', () => {
  test.each([
    ['2026-10-28', 'OVERDUE'],
    ['2026-10-29', 'THIS_WEEK'],
    ['2026-10-31', 'THIS_WEEK'],
    ['2026-11-04', 'THIS_WEEK'],
    ['2026-11-05', 'NEXT_MONTH'],
    ['2026-11-30', 'NEXT_MONTH'],
    ['2026-12-01', 'LATER'],
  ] as const)('today 2026-10-29: %s → %s', (due, group) => {
    expect(invoiceGroup(due, TODAY)).toBe(group);
  });
  test('no due date → UNSCHEDULED', () => {
    expect(invoiceGroup(null, TODAY)).toBe('UNSCHEDULED');
  });
  test('rest of the current month after this week → THIS_MONTH', () => {
    expect(invoiceGroup('2026-10-20', '2026-10-10')).toBe('THIS_MONTH');
    expect(invoiceGroup('2026-11-01', '2026-10-10')).toBe('NEXT_MONTH');
  });
  test('December rolls into January', () => {
    expect(invoiceGroup('2027-01-15', '2026-12-05')).toBe('NEXT_MONTH');
  });
});
