import { type PaymentDto, updatePaymentMetaSchema } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, toast } from '@salescrm/ui';
import { useState } from 'react';
import { formatApiMoney } from '../../lib/money';
import { useEditPayment } from './api';
import { converted } from './FxField';

/** P-4: label, invoice ID, date and note stay editable; the amount is shown but never editable. */
export function EditPaymentDialog({ payment, onClose }: { payment: PaymentDto; onClose: () => void }) {
  const edit = useEditPayment(payment.id);
  const [label, setLabel] = useState(payment.milestoneLabel);
  const [invoiceId, setInvoiceId] = useState(payment.invoiceId ?? '');
  const [date, setDate] = useState(payment.paymentDate);
  const [note, setNote] = useState(payment.note ?? '');
  // D-020: the rate can be corrected (e.g. to the bank's actual rate); the base amount is recomputed by the server.
  const foreign = !!payment.baseCurrency && payment.baseCurrency !== payment.project.currency;
  const [rate, setRate] = useState(payment.fxRate ?? '');
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Edit payment details</DialogTitle>
        <DialogDescription>
          Amount {formatApiMoney(payment.amountMinor, payment.project.currency)} (locked — reverse to correct it)
        </DialogDescription>
        <form
          noValidate
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = updatePaymentMetaSchema.safeParse({
              milestoneLabel: label,
              invoiceId: invoiceId || null,
              paymentDate: date,
              note: note || null,
              ...(foreign && rate.trim() !== (payment.fxRate ?? '') ? { fxRate: rate.trim() } : {}),
            });
            if (!parsed.success) return setError(parsed.error.issues[0]!.message);
            edit.mutate(parsed.data, {
              onSuccess: () => (toast.success('Payment updated'), onClose()),
              onError: (err) => setError(err.message),
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ep-label">Milestone</Label>
              <Input id="ep-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-invoice">Invoice ID</Label>
              <Input id="ep-invoice" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-date">Payment date</Label>
              <Input id="ep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-note">Note</Label>
              <Input id="ep-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          {foreign && (
            <div className="space-y-1.5">
              <Label htmlFor="ep-rate">
                Exchange rate (1 {payment.project.currency} in {payment.baseCurrency})
              </Label>
              <Input id="ep-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
              {converted(payment.amountMinor, rate, payment.project.currency, payment.baseCurrency!) && (
                <p className="text-xs text-text-muted">
                  = {converted(payment.amountMinor, rate, payment.project.currency, payment.baseCurrency!)} received
                </p>
              )}
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={edit.isPending}>
              Save details
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
