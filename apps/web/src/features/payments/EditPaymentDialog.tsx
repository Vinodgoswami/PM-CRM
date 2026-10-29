import { type PaymentDto, updatePaymentMetaSchema } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, toast } from '@salescrm/ui';
import { useState } from 'react';
import { formatApiMoney } from '../../lib/money';
import { useEditPayment } from './api';

/** P-4: label, invoice ID, date and note stay editable; the amount is shown but never editable. */
export function EditPaymentDialog({ payment, onClose }: { payment: PaymentDto; onClose: () => void }) {
  const edit = useEditPayment(payment.id);
  const [label, setLabel] = useState(payment.milestoneLabel);
  const [invoiceId, setInvoiceId] = useState(payment.invoiceId ?? '');
  const [date, setDate] = useState(payment.paymentDate);
  const [note, setNote] = useState(payment.note ?? '');
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
