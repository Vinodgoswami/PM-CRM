import { todayIn } from '@salescrm/core';
import { paymentDtoSchema } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, toast } from '@salescrm/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatApiMoney } from '../../lib/money';
import { useSettings } from '../settings/api';
import { useRefreshAfterPayment } from './api';
import { MarkPaidDialog, type MarkPaidTarget } from './MarkPaidDialog';

type Open = { mode: 'quick' | 'full'; target: MarkPaidTarget; error?: string };

/**
 * D-049 / D-054: Mark as paid. A milestone that already has its invoice ID only asks for the payment date, starting at
 * its due date (the date read from the invoice) so the payment lands in the right month; the full form opens without an
 * invoice ID, on More details, or when the quick payment is refused.
 */
export function useMarkPaidFlow() {
  const [open, setOpen] = useState<Open | null>(null);
  const timezone = useSettings().data?.timezone ?? 'Asia/Kolkata';
  const today = todayIn(timezone, new Date());
  const refresh = useRefreshAfterPayment();
  const quick = useMutation({
    mutationFn: ({ t, date, key }: { t: MarkPaidTarget; date: string; key: string }) =>
      apiFetch(`/milestones/${t.milestoneId}/payments`, {
        method: 'POST',
        body: { milestoneLabel: `M${t.number}`, invoiceId: t.invoiceId, paymentDate: date, amountMinor: t.balanceMinor },
        schema: paymentDtoSchema,
        headers: { 'Idempotency-Key': key },
      }),
    onSuccess: refresh,
  });

  const start = (target: MarkPaidTarget) => setOpen({ mode: target.invoiceId ? 'quick' : 'full', target });
  const close = () => setOpen(null);

  let dialog = null;
  if (open?.mode === 'full') {
    dialog = <MarkPaidDialog target={open.target} initialError={open.error} onClose={close} />;
  } else if (open?.mode === 'quick') {
    const t = open.target;
    const startDate = t.dueDate && t.dueDate <= today ? t.dueDate : today;
    dialog = (
      <QuickPayDialog
        target={t}
        startDate={startDate}
        today={today}
        pending={quick.isPending}
        onClose={close}
        onMore={(date) => setOpen({ mode: 'full', target: { ...t, paymentDate: date } })}
        onPay={(date, key) =>
          quick.mutate(
            { t, date, key },
            {
              onSuccess: () => {
                toast.success(`M${t.number} marked as paid on ${date} · ${t.invoiceId}`);
                close();
              },
              onError: (err) => setOpen({ mode: 'full', target: { ...t, paymentDate: date }, error: err.message }),
            },
          )
        }
      />
    );
  }
  return { start, dialog };
}

function QuickPayDialog({
  target,
  startDate,
  today,
  pending,
  onClose,
  onMore,
  onPay,
}: {
  target: MarkPaidTarget;
  startDate: string;
  today: string;
  pending: boolean;
  onClose: () => void;
  onMore: (date: string) => void;
  onPay: (date: string, key: string) => void;
}) {
  const [date, setDate] = useState(startDate);
  // One key per popup: a double click replays the same request instead of paying twice.
  const [key] = useState(() => crypto.randomUUID());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Mark M{target.number} as paid</DialogTitle>
        <DialogDescription>
          {target.title} · {formatApiMoney(target.balanceMinor, target.currency)}
        </DialogDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!date || date > today) return toast.error('Choose a payment date that is not in the future.');
            onPay(date, key);
          }}
        >
          <p className="text-sm">
            Invoice ID <span className="font-medium">{target.invoiceId}</span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="qp-date">Payment date</Label>
            <Input id="qp-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-xs text-text-muted">Starts at the invoice date; change it if the money came in on another day.</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onMore(date)}>
              More details
            </Button>
            <Button type="submit" disabled={pending}>
              Mark as paid
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
