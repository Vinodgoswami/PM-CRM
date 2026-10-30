import { type PaymentDto } from '@salescrm/schemas';
import { formatApiMoney } from '../../lib/money';

/** D-020: under a payment in a foreign currency, the same money in the company's currency and the rate used. */
export function BaseAmount({ payment }: { payment: PaymentDto }) {
  if (!payment.baseCurrency || payment.baseAmountMinor === null || payment.baseCurrency === payment.project.currency) return null;
  return (
    <span className="block text-xs font-normal text-text-muted">
      {formatApiMoney(payment.baseAmountMinor, payment.baseCurrency)} @ {payment.fxRate}
    </span>
  );
}
