import { expect, test } from 'vitest';
import { agingBuckets, type MetricProject, monthlySeries, summarise } from '../src/metrics';

const TODAY = '2026-10-29';
const P = (over: Partial<MetricProject>): MetricProject => ({
  id: 'p',
  ownerId: 'u1',
  clientId: 'c1',
  status: 'ACTIVE',
  wonAt: '2026-05-10',
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
  expect(s.outstandingMinor).toBe(30000n + 30000n);
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
