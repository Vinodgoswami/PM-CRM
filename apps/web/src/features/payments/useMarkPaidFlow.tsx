import { todayIn } from '@salescrm/core';
import { paymentDtoSchema } from '@salescrm/schemas';
import { toast } from '@salescrm/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useSettings } from '../settings/api';
import { useRefreshAfterPayment } from './api';
import { MarkPaidDialog, type MarkPaidTarget } from './MarkPaidDialog';

/**
 * D-049: Mark as paid. A milestone that already has its invoice ID is paid in one click (the balance, today, the day's
 * rate looked up by the server); otherwise, or if that is refused, the form opens filled in so it can be edited.
 */
export function useMarkPaidFlow() {
  const [paying, setPaying] = useState<{ target: MarkPaidTarget; error?: string } | null>(null);
  const timezone = useSettings().data?.timezone ?? 'Asia/Kolkata';
  const refresh = useRefreshAfterPayment();
  const quick = useMutation({
    mutationFn: (t: MarkPaidTarget) =>
      apiFetch(`/milestones/${t.milestoneId}/payments`, {
        method: 'POST',
        body: {
          milestoneLabel: `M${t.number}`,
          invoiceId: t.invoiceId,
          paymentDate: todayIn(timezone, new Date()),
          amountMinor: t.balanceMinor,
        },
        schema: paymentDtoSchema,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: refresh,
  });

  const start = (target: MarkPaidTarget) => {
    if (!target.invoiceId) return setPaying({ target });
    quick.mutate(target, {
      onSuccess: () => toast.success(`M${target.number} marked as paid · ${target.invoiceId}. Change it from the Payments tab if needed.`),
      onError: (err) => setPaying({ target, error: err.message }),
    });
  };

  return {
    start,
    /** The milestone being paid in one click, so its button can show it is busy. */
    busyId: quick.isPending ? quick.variables?.milestoneId : undefined,
    dialog: paying && <MarkPaidDialog target={paying.target} initialError={paying.error} onClose={() => setPaying(null)} />,
  };
}
