import { type IsoDate } from './period';

export interface ProjectMoneyInput {
  expectedAmountMinor: bigint;
  upsellEntries: { amountMinor: bigint }[];
  milestones: { amountMinor: bigint; dueDate: IsoDate | null; paidMinor: bigint }[];
  /** Confirmed work (Confirmed, Active, On hold, Completed); an enquiry, quote or cancelled project owes nothing. */
  booked?: boolean;
}

export interface ProjectTotals {
  contractValueMinor: bigint;
  scheduledMinor: bigint;
  unscheduledMinor: bigint;
  collectedMinor: bigint;
  outstandingMinor: bigint;
  nextDueDate: IsoDate | null;
  hasOverdue: boolean;
}

/** Derived values from docs/05; never stored. */
export function projectTotals(p: ProjectMoneyInput, today: IsoDate): ProjectTotals {
  const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
  const contractValueMinor = p.expectedAmountMinor + sum(p.upsellEntries.map((u) => u.amountMinor));
  const scheduledMinor = sum(p.milestones.map((m) => m.amountMinor));
  const open = p.milestones.filter((m) => m.amountMinor - m.paidMinor > 0n);
  const nextDueDate =
    open
      .map((m) => m.dueDate)
      .filter((d): d is IsoDate => !!d && d >= today)
      .sort()[0] ?? null;
  const collectedMinor = sum(p.milestones.map((m) => m.paidMinor));
  // D-061: outstanding is everything still to be paid on the contract, due or not (never below 0).
  const left = contractValueMinor - collectedMinor;
  return {
    contractValueMinor,
    scheduledMinor,
    unscheduledMinor: contractValueMinor - scheduledMinor,
    collectedMinor,
    outstandingMinor: p.booked === false || left < 0n ? 0n : left,
    nextDueDate,
    hasOverdue: open.some((m) => m.dueDate !== null && m.dueDate < today),
  };
}
