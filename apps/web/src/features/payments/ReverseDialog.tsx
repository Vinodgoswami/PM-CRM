import { type PaymentDto, reversePaymentSchema } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, toast } from '@salescrm/ui';
import { useState } from 'react';
import { formatApiMoney } from '../../lib/money';
import { useReversePayment } from './api';

/** docs/06 P-5 / flow F3: the only way to correct a saved amount. */
export function ReverseDialog({ payment, onClose }: { payment: PaymentDto; onClose: () => void }) {
  const reverse = useReversePayment(payment.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Reverse payment</DialogTitle>
        <DialogDescription>
          Adds −{formatApiMoney(payment.amountMinor, payment.project.currency)} so the milestone is unpaid again. Then record the correct
          payment.
        </DialogDescription>
        <form
          noValidate
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = reversePaymentSchema.safeParse({ reason });
            if (!parsed.success) return setError(parsed.error.issues[0]!.message);
            reverse.mutate(parsed.data.reason, {
              onSuccess: () => {
                toast.success('Payment reversed');
                onClose();
              },
              onError: (err) => setError(err.message),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="rev-reason">Reason</Label>
            <Input
              id="rev-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Recorded against the wrong invoice"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={reverse.isPending}>
              Reverse payment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
