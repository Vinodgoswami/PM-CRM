import { type IsoDate } from './period';

export type PaymentCheck = { ok: true } | { ok: false; rule: 'P-2' | 'P-6'; message: string };

/** docs/06 P-2 (0 < amount ≤ balance) and P-6 (no future dates). Partial payments are fine (P-3). */
export function checkPayment(
  input: { amountMinor: bigint; paymentDate: IsoDate },
  milestone: { amountMinor: bigint; paidMinor: bigint },
  today: IsoDate,
): PaymentCheck {
  const balance = milestone.amountMinor - milestone.paidMinor;
  if (input.amountMinor <= 0n) return { ok: false, rule: 'P-2', message: 'Enter an amount above zero.' };
  if (input.amountMinor > balance) {
    return {
      ok: false,
      rule: 'P-2',
      message: 'The amount is more than what is left to pay on this milestone. Add the extra as a separate milestone.',
    };
  }
  if (input.paymentDate > today) return { ok: false, rule: 'P-6', message: 'The payment date cannot be in the future.' };
  return { ok: true };
}
