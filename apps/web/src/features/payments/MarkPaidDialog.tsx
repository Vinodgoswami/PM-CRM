import { todayIn } from '@salescrm/core';
import { createPaymentSchema } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, toast } from '@salescrm/ui';
import { useRef, useState } from 'react';
import { formatApiMoney } from '../../lib/money';
import { MoneyInput } from '../projects/MoneyInput';
import { useSettings } from '../settings/api';
import { /* useAttachSlip, */ useMarkPaid } from './api';
import { SlipDropzone } from './SlipDropzone';
import { type InvoiceFields, parseInvoiceText } from './invoice-text';
import { readPdfText } from './readPdfText';
import { converted, FxField } from './FxField';

export interface MarkPaidTarget {
  milestoneId: string;
  number: number;
  title: string;
  balanceMinor: number;
  currency: string;
}

/** docs/08 S6 / flow F2. The amount defaults to the remaining balance and is locked once saved (P-4). */
export function MarkPaidDialog({ target, onClose }: { target: MarkPaidTarget; onClose: () => void }) {
  const markPaid = useMarkPaid(target.milestoneId);
  const settings = useSettings().data;
  const timezone = settings?.timezone ?? 'Asia/Kolkata';
  // D-020: a payment in another currency than the company's records the rate too.
  const base = settings?.baseCurrency ?? target.currency;
  const needsRate = base !== target.currency;
  const [rate, setRate] = useState('');
  const today = todayIn(timezone, new Date());
  // One key per dialog: a retry or double click replays the same request instead of paying twice.
  const [key] = useState(() => crypto.randomUUID());
  const sending = useRef(false);
  const [label, setLabel] = useState(`M${target.number}`);
  const [invoiceId, setInvoiceId] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState<{ minor: number | null; error: string | null }>({ minor: target.balanceMinor, error: null });
  const [error, setError] = useState<string | null>(null);
  // D-026: an optional invoice or payment slip, stored with the payment once it is saved.
  const [slip, setSlip] = useState<File | null>(null);
  // D-040: an invoice PDF fills the fields it can read; the amount box is re-created to show a filled amount.
  const [amountShown, setAmountShown] = useState({ key: 0, minor: target.balanceMinor });
  const [filled, setFilled] = useState<string | null>(null);

  const chooseSlip = async (file: File | null) => {
    setSlip(file);
    setFilled(null);
    if (!file || file.type !== 'application/pdf') return;
    let fields: InvoiceFields = {};
    try {
      fields = parseInvoiceText(await readPdfText(file), target.currency);
    } catch {
      /* unreadable PDF: treated like one without text */
    }
    const got: string[] = [];
    if (fields.invoiceId) {
      setInvoiceId(fields.invoiceId);
      got.push('invoice ID');
    }
    if (fields.amountMinor !== undefined && fields.amountMinor <= target.balanceMinor) {
      setAmount({ minor: fields.amountMinor, error: null });
      setAmountShown((a) => ({ key: a.key + 1, minor: fields.amountMinor! }));
      got.push('amount');
    }
    if (fields.date && fields.date <= today) {
      setDate(fields.date);
      got.push('date');
    }
    setFilled(
      got.length
        ? `Filled from ${file.name}: ${got.join(', ')}. Check them before saving.`
        : `No details could be read from ${file.name} (a scan or photo has no text). Enter them below.`,
    );
  };
  // D-043: storing the invoice is paused for now; the file is only read to fill the fields. Uncomment to store it again.
  // const attach = useAttachSlip();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    if (amount.minor === null) return setError(amount.error ?? 'Enter an amount');
    if (needsRate && !converted(amount.minor, rate, target.currency, base)) return setError('Enter the exchange rate (e.g. 0.0119).');
    const parsed = createPaymentSchema.safeParse({
      milestoneLabel: label,
      paymentDate: date,
      amountMinor: amount.minor,
      ...(invoiceId.trim() ? { invoiceId } : {}),
      ...(note.trim() ? { note } : {}),
      ...(needsRate ? { fxRate: rate.trim() } : {}),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError(null);
    sending.current = true;
    markPaid.mutate(
      { input: parsed.data, key },
      {
        onSuccess: () => {
          toast.success(`${label} marked as paid`);
          onClose();
          // D-043: paused, see above (takes `(payment) =>` again when restored).
          // if (!slip) {
          //   toast.success(`${label} marked as paid`);
          //   return onClose();
          // }
          // attach.mutate(
          //   { file: slip, payment },
          //   {
          //     onSuccess: () => toast.success(`${label} marked as paid, ${slip.name} stored`),
          //     onError: (err) =>
          //       toast.error(`Payment saved, but ${slip.name} did not upload (${err.message}). Attach it from the Payments tab.`),
          //     onSettled: onClose,
          //   },
          // );
        },
        onError: (err) => setError(err.message),
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Mark as paid</DialogTitle>
        <DialogDescription>
          M{target.number} · {target.title} · {formatApiMoney(target.balanceMinor, target.currency)} left to pay
        </DialogDescription>
        <form noValidate onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mp-label">Milestone</Label>
              <Input id="mp-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-invoice">Invoice ID</Label>
              <Input id="mp-invoice" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="e.g. INV-1042" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-date">Payment date</Label>
              <Input id="mp-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-amount">Amount</Label>
              <MoneyInput
                id="mp-amount"
                currency={target.currency}
                key={amountShown.key}
                defaultMinor={amountShown.minor}
                onValue={(minor, err) => setAmount({ minor, error: err })}
              />
              <p className="text-xs text-text-muted">The amount can&apos;t be changed after saving.</p>
            </div>
          </div>
          {needsRate && (
            <FxField id="mp-rate" from={target.currency} to={base} date={date} amountMinor={amount.minor} value={rate} onChange={setRate} />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mp-note">Note</Label>
            <Input id="mp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mp-slip">
              Invoice or payment slip <span className="font-normal text-text-muted">(optional)</span>
            </Label>
            <SlipDropzone id="mp-slip" file={slip} onChange={(f) => void chooseSlip(f)} onError={setError} />
            {filled && (
              <p role="status" className="text-xs text-text-muted">
                {filled}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={markPaid.isPending /* || attach.isPending */}>
              {/* {attach.isPending ? 'Uploading…' : 'Save payment'} */}
              Save payment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
