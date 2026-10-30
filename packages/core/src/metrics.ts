import { type IsoDate } from './period';

/**
 * Dashboard metrics (docs/09). Pure functions over plain project data so every formula is unit-tested and the API,
 * exports and future reports share one definition. Date rules: docs/06 PR-3.
 */
export interface MetricProject {
  id: string;
  ownerId: string;
  clientId: string;
  status: 'LEAD' | 'PROPOSAL' | 'WON' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'LOST';
  wonAt: IsoDate | null;
  /** Set on COMPLETED / LOST (PS-2); K11 counts a loss on this date. */
  closedAt: IsoDate | null;
  expectedAmountMinor: bigint;
  isUpsell: boolean;
  upsellEntries: { amountMinor: bigint; date: IsoDate }[];
  milestones: { amountMinor: bigint; dueDate: IsoDate | null; payments: { amountMinor: bigint; paymentDate: IsoDate }[] }[];
}

export interface MetricRange {
  from: IsoDate;
  to: IsoDate;
}

const inRange = (d: IsoDate | null, r: MetricRange) => d !== null && d >= r.from && d <= r.to;
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const paidOf = (m: MetricProject['milestones'][number]) => sum(m.payments.map((p) => p.amountMinor));
const addDays = (d: IsoDate, n: number): IsoDate => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};
const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const booked = (p: MetricProject) => p.wonAt !== null;
/** Work whose milestones are real receivables (PS-3: pipeline is not booked; LOST is not owed). */
export const BOOKED_STATUSES: MetricProject['status'][] = ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];
const receivable = (p: MetricProject) => BOOKED_STATUSES.includes(p.status);

export interface Summary {
  bookedMinor: bigint;
  upsellMinor: bigint;
  collectedMinor: bigint;
  expectedMinor: bigint;
  collectionRate: number | null;
  outstandingMinor: bigint;
  overdueMinor: bigint;
  overdueCount: number;
  dueNext30Minor: bigint;
  pipelineMinor: bigint;
  wonCount: number;
  /** K12 numerator: expected amount of every project won in the period (upsell projects included). */
  wonExpectedMinor: bigint;
  lostCount: number;
  /** K11: won ÷ (won + lost) in the period; a project won and later lost is a loss. Null when neither happened. */
  winRate: number | null;
}

export function summarise(projects: MetricProject[], range: MetricRange, today: IsoDate): Summary {
  let bookedMinor = 0n;
  let upsellMinor = 0n;
  let collectedMinor = 0n;
  let expectedMinor = 0n;
  let paidOnExpected = 0n;
  let outstandingMinor = 0n;
  let overdueMinor = 0n;
  let overdueCount = 0;
  let dueNext30Minor = 0n;
  let pipelineMinor = 0n;
  let wonCount = 0;
  let wonExpectedMinor = 0n;
  let wins = 0;
  let losses = 0;
  const in30 = addDays(today, 30);

  for (const p of projects) {
    if (p.status === 'LEAD' || p.status === 'PROPOSAL') pipelineMinor += p.expectedAmountMinor;
    if (p.status === 'LOST') {
      if (inRange(p.closedAt, range)) losses += 1;
    } else if (inRange(p.wonAt, range)) wins += 1;
    // K1 / K8: a project is booked on wonAt; upsell entries on their own date (only on booked projects).
    if (booked(p) && inRange(p.wonAt, range)) {
      bookedMinor += p.expectedAmountMinor;
      wonExpectedMinor += p.expectedAmountMinor;
      wonCount += 1;
      if (p.isUpsell) upsellMinor += p.expectedAmountMinor;
    }
    if (booked(p)) {
      const entries = sum(p.upsellEntries.filter((u) => inRange(u.date, range)).map((u) => u.amountMinor));
      bookedMinor += entries;
      upsellMinor += entries;
    }
    for (const m of p.milestones) {
      const paid = paidOf(m);
      const balance = m.amountMinor - paid;
      // Money actually received always counts; expected / owed only for booked work.
      collectedMinor += sum(m.payments.filter((x) => inRange(x.paymentDate, range)).map((x) => x.amountMinor));
      if (!receivable(p)) continue;
      if (inRange(m.dueDate, range)) {
        expectedMinor += m.amountMinor;
        paidOnExpected += paid;
      }
      if (balance > 0n && m.dueDate) {
        if (m.dueDate <= today) outstandingMinor += balance;
        if (m.dueDate < today) {
          overdueMinor += balance;
          overdueCount += 1;
        } else if (m.dueDate <= in30) dueNext30Minor += balance;
      }
    }
  }
  const lostCount = projects.filter((p) => p.status === 'LOST').length;
  return {
    bookedMinor,
    upsellMinor,
    collectedMinor,
    expectedMinor,
    collectionRate: expectedMinor > 0n ? Number(paidOnExpected) / Number(expectedMinor) : null,
    outstandingMinor,
    overdueMinor,
    overdueCount,
    dueNext30Minor,
    pipelineMinor,
    wonCount,
    wonExpectedMinor,
    lostCount,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
  };
}

/** C1: booked / collected / expected per calendar month ("YYYY-MM"). */
export function monthlySeries(projects: MetricProject[], months: string[], today: IsoDate) {
  return months.map((month) => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const range = { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
    const s = summarise(projects, range, today);
    return { month, bookedMinor: s.bookedMinor, collectedMinor: s.collectedMinor, expectedMinor: s.expectedMinor };
  });
}

/** C5: unpaid balance by days past due. */
export function agingBuckets(projects: MetricProject[], today: IsoDate) {
  const out = { d1_30: 0n, d31_60: 0n, d61_90: 0n, d90plus: 0n };
  for (const p of projects.filter(receivable)) {
    for (const m of p.milestones) {
      const balance = m.amountMinor - paidOf(m);
      if (balance <= 0n || !m.dueDate || m.dueDate >= today) continue;
      const late = daysBetween(m.dueDate, today);
      if (late <= 30) out.d1_30 += balance;
      else if (late <= 60) out.d31_60 += balance;
      else if (late <= 90) out.d61_90 += balance;
      else out.d90plus += balance;
    }
  }
  return out;
}

/** C4: balance falling due in each of the next `months` calendar months (overdue carried separately). */
export function cashInForecast(projects: MetricProject[], today: IsoDate, months: number) {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const keys = Array.from({ length: months }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7));
  const out = new Map(keys.map((k) => [k, 0n]));
  for (const p of projects.filter(receivable)) {
    for (const mm of p.milestones) {
      const balance = mm.amountMinor - paidOf(mm);
      if (balance <= 0n || !mm.dueDate || mm.dueDate < today) continue;
      const k = mm.dueDate.slice(0, 7);
      if (out.has(k)) out.set(k, out.get(k)! + balance);
    }
  }
  return keys.map((month) => ({ month, scheduledMinor: out.get(month)! }));
}
