import { convertMinor } from '@salescrm/types';

/** The parts of a project row the conversion needs (Prisma Decimal for rates). */
interface Rated {
  currency: string;
  fxRate: { toString(): string } | null;
  fxBaseCurrency: string | null;
}

/** D-020: base-currency units per 1 project-currency unit, or null when the project has no usable rate. */
export function projectRate(p: Rated, base: string): string | null {
  if (p.currency === base) return '1';
  return p.fxRate && p.fxBaseCurrency === base ? p.fxRate.toString() : null;
}

type Pay = { amountMinor: bigint; paymentDate: Date; createdAt?: Date; baseAmountMinor?: bigint | null; baseCurrency?: string | null };
type Converted<P> = P & { collectedMinor: bigint };
type Projectish = Rated & {
  expectedAmountMinor: bigint;
  upsellEntries: { amountMinor: bigint }[];
  milestones: { amountMinor: bigint; payments: Pay[] }[];
};
export type InBase<T extends Projectish> = Omit<T, 'milestones'> & {
  milestones: (Omit<T['milestones'][number], 'payments'> & { payments: Converted<T['milestones'][number]['payments'][number]>[] })[];
};

/**
 * A copy of the project with every amount in the base currency, or null when it has no rate (left out, counted).
 * Contract, milestone and extra-work amounts use the project's saved rate. Each payment's `amountMinor` is its share of
 * the milestone at that same rate, taken cumulatively so a fully paid milestone converts to exactly zero balance;
 * `collectedMinor` is what the payment actually brought in at its own day's rate.
 */
export function inBase<T extends Projectish>(p: T, base: string, startRate?: string | null): InBase<T> | null {
  // D-039: without a saved rate for this currency, the rate of the day the project was created (looked up).
  const rate = projectRate(p, base) ?? startRate ?? null;
  if (!rate) return null;
  const conv = (m: bigint) => convertMinor(m, rate, p.currency, base);
  return {
    ...p,
    expectedAmountMinor: conv(p.expectedAmountMinor),
    upsellEntries: p.upsellEntries.map((u) => ({ ...u, amountMinor: conv(u.amountMinor) })),
    milestones: p.milestones.map((m) => {
      let paid = 0n;
      const payments = [...m.payments]
        .sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime() || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
        .map((x) => {
          const share = conv(paid + x.amountMinor) - conv(paid);
          paid += x.amountMinor;
          const actual =
            x.baseCurrency === base && x.baseAmountMinor !== null && x.baseAmountMinor !== undefined ? x.baseAmountMinor : share;
          return { ...x, amountMinor: share, collectedMinor: actual };
        });
      return { ...m, amountMinor: conv(m.amountMinor), payments };
    }),
  } as InBase<T>;
}
