import { expect, test } from 'vitest';
import {
  agingBuckets,
  type MetricProject,
  monthlySeries,
  pipelineFunnel,
  quarterComparison,
  summarise,
  yearOverYear,
} from '../src/metrics';

const TODAY = '2026-10-29';
const P = (over: Partial<MetricProject>): MetricProject => ({
  id: 'p',
  ownerId: 'u1',
  clientId: 'c1',
  status: 'ACTIVE',
  wonAt: '2026-05-10',
  closedAt: null,
  expectedAmountMinor: 100000n,
  isUpsell: false,
  upsellEntries: [],
  milestones: [],
  ...over,
});
const M = (amountMinor: bigint, dueDate: string | null, payments: [string, bigint][] = []) => ({
  amountMinor,
  dueDate,
  payments: payments.map(([paymentDate, amount]) => ({ paymentDate, amountMinor: amount })),
});

const projects: MetricProject[] = [
  P({
    id: 'a',
    milestones: [M(60000n, '2026-06-01', [['2026-06-10', 60000n]]), M(40000n, '2026-09-01', [['2026-09-20', 10000n]])],
    upsellEntries: [{ amountMinor: 20000n, date: '2026-08-15' }],
  }),
  P({ id: 'b', wonAt: '2026-10-05', expectedAmountMinor: 50000n, isUpsell: true, milestones: [M(50000n, '2026-11-10')] }),
  P({ id: 'c', status: 'PROPOSAL', wonAt: null, expectedAmountMinor: 70000n }),
  P({ id: 'd', status: 'LOST', wonAt: null, expectedAmountMinor: 90000n }),
  P({ id: 'e', wonAt: '2025-12-01', expectedAmountMinor: 30000n, milestones: [M(30000n, '2026-03-01')] }),
];
const FY = { from: '2026-04-01', to: '2027-03-31' };

test('K1 booked = won expected + upsell entries in range; K8 upsell part', () => {
  const s = summarise(projects, FY, TODAY);
  expect(s.bookedMinor).toBe(100000n + 20000n + 50000n);
  expect(s.upsellMinor).toBe(20000n + 50000n);
});

test('K2 collected by payment date; K3 expected by due date; K9 collection rate', () => {
  const s = summarise(projects, FY, TODAY);
  expect(s.collectedMinor).toBe(70000n);
  expect(s.expectedMinor).toBe(60000n + 40000n + 50000n);
  expect(s.collectionRate).toBeCloseTo(70000 / 150000);
});

test('K4/K5/K6 outstanding, overdue and due in 30 days are point-in-time', () => {
  const s = summarise(projects, FY, TODAY);
  // D-061: outstanding = contract value − collected on confirmed work (a: 120,000 − 70,000; b: 50,000; e: 30,000).
  expect(s.outstandingMinor).toBe(50000n + 50000n + 30000n);
  expect(s.overdueMinor).toBe(30000n + 30000n);
  expect(s.overdueCount).toBe(2);
  expect(s.dueNext30Minor).toBe(50000n);
});

test('K7 pipeline = LEAD and PROPOSAL expected amounts', () => {
  expect(summarise(projects, FY, TODAY).pipelineMinor).toBe(70000n);
});

test('C1 monthly series buckets by month', () => {
  const series = monthlySeries(projects, ['2026-06', '2026-09', '2026-10'], TODAY);
  expect(series).toEqual([
    { month: '2026-06', bookedMinor: 0n, collectedMinor: 60000n, expectedMinor: 60000n },
    { month: '2026-09', bookedMinor: 0n, collectedMinor: 10000n, expectedMinor: 40000n },
    { month: '2026-10', bookedMinor: 50000n, collectedMinor: 0n, expectedMinor: 0n },
  ]);
});

test('C5 aging buckets by days past due', () => {
  expect(agingBuckets(projects, TODAY)).toEqual({ d1_30: 0n, d31_60: 30000n, d61_90: 0n, d90plus: 30000n });
});

test('review: milestones of unbooked projects are not receivables', () => {
  const lead = P({ id: 'l', status: 'LEAD', wonAt: null, milestones: [M(50000n, '2026-09-01')] });
  const s = summarise([lead], FY, TODAY);
  expect(s).toMatchObject({ expectedMinor: 0n, outstandingMinor: 0n, overdueMinor: 0n, overdueCount: 0, dueNext30Minor: 0n });
  expect(agingBuckets([lead], TODAY)).toEqual({ d1_30: 0n, d31_60: 0n, d61_90: 0n, d90plus: 0n });
});

test('K12 average deal = expected amount of projects won ÷ projects won', () => {
  const s = summarise(
    [P({ id: 'n', expectedAmountMinor: 100000n }), P({ id: 'u', expectedAmountMinor: 20000n, isUpsell: true })],
    FY,
    TODAY,
  );
  expect(s.wonExpectedMinor).toBe(120000n);
  expect(s.wonCount).toBe(2);
});

test('K11 win rate = won in period ÷ (won in period + lost in period)', () => {
  const deals = [
    P({ id: 'w1', wonAt: '2026-05-01' }),
    P({ id: 'w2', status: 'COMPLETED', wonAt: '2026-06-01', closedAt: '2026-09-01' }),
    P({ id: 'w3', wonAt: '2026-07-01' }),
    P({ id: 'l1', status: 'LOST', wonAt: null, closedAt: '2026-08-01' }),
    P({ id: 'old', status: 'LOST', wonAt: null, closedAt: '2025-08-01' }),
    P({ id: 'open', status: 'PROPOSAL', wonAt: null }),
  ];
  expect(summarise(deals, FY, TODAY).winRate).toBeCloseTo(3 / 4);
});

test('K11 a project won and later lost counts as a loss, not a win', () => {
  const deals = [P({ id: 'w', wonAt: '2026-05-01' }), P({ id: 'wl', status: 'LOST', wonAt: '2026-05-02', closedAt: '2026-07-01' })];
  expect(summarise(deals, FY, TODAY).winRate).toBeCloseTo(1 / 2);
});

test('K11 is null when nothing was won or lost in the period', () => {
  expect(summarise([P({ status: 'PROPOSAL', wonAt: null })], FY, TODAY).winRate).toBeNull();
});

test('K10 average days to pay = mean(paymentDate − dueDate) over payments in the period', () => {
  // a: M1 due 06-01 paid 06-10 (9 days); M2 due 09-01 paid 09-20 (19 days).
  expect(summarise(projects, FY, TODAY).avgDaysToPay).toBe(14);
  expect(summarise(projects, { from: '2027-01-01', to: '2027-03-31' }, TODAY).avgDaysToPay).toBeNull();
});

test('C2 quarter comparison: each FY quarter against the same quarter a year earlier', () => {
  expect(quarterComparison(projects, '2026-04-01', TODAY)).toEqual([
    { label: 'Q1', bookedMinor: 100000n, collectedMinor: 60000n, prevBookedMinor: 0n, prevCollectedMinor: 0n },
    { label: 'Q2', bookedMinor: 20000n, collectedMinor: 10000n, prevBookedMinor: 0n, prevCollectedMinor: 0n },
    { label: 'Q3', bookedMinor: 50000n, collectedMinor: 0n, prevBookedMinor: 30000n, prevCollectedMinor: 0n },
    { label: 'Q4', bookedMinor: 0n, collectedMinor: 0n, prevBookedMinor: 0n, prevCollectedMinor: 0n },
  ]);
});

test('C3 year over year: cumulative collected by FY month; future months are null', () => {
  const yoy = yearOverYear(projects, '2026-04-01', TODAY);
  expect(yoy).toHaveLength(12);
  expect(yoy.slice(0, 8).map((x) => x.cumulativeMinor)).toEqual([0n, 0n, 60000n, 60000n, 60000n, 70000n, 70000n, null]);
  expect(yoy[0]).toMatchObject({ month: '2026-04', previousCumulativeMinor: 0n });
});

test('C8 pipeline funnel: count and expected value by current status', () => {
  expect(pipelineFunnel(projects)).toEqual([
    { status: 'LEAD', count: 0, valueMinor: 0n },
    { status: 'PROPOSAL', count: 1, valueMinor: 70000n },
    { status: 'WON', count: 0, valueMinor: 0n },
    { status: 'ACTIVE', count: 3, valueMinor: 180000n },
    { status: 'COMPLETED', count: 0, valueMinor: 0n },
    { status: 'LOST', count: 1, valueMinor: 90000n },
  ]);
});

test('D-020 collected uses what each payment actually brought in; balances use the contract-rate amounts', () => {
  const p = P({
    milestones: [
      {
        amountMinor: 72000n,
        dueDate: '2026-06-01',
        payments: [{ amountMinor: 72000n, paymentDate: '2026-06-10', collectedMinor: 63000n }],
      },
    ],
  });
  const s = summarise([p], FY, TODAY);
  expect(s.collectedMinor).toBe(63000n);
  // The contract-rate amounts: 100,000 booked − 72,000 paid.
  expect(s.outstandingMinor).toBe(28000n);
});
