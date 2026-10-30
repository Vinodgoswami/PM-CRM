import { todayIn } from '@salescrm/core';
import { createPaymentSchema } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, toast } from '@salescrm/ui';
import { useRef, useState } from 'react';
import { formatApiMoney } from '../../lib/money';
import { MoneyInput } from '../projects/MoneyInput';
import { useSettings } from '../settings/api';
import { Paperclip, X } from 'lucide-react';
import { fileProblem } from '../projects/api';
import { useAttachSlip, useMarkPaid } from './api';
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
  const attach = useAttachSlip();

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
        onSuccess: (payment) => {
          if (!slip) {
            toast.success(`${label} marked as paid`);
            return onClose();
          }
          attach.mutate(
            { file: slip, payment },
            {
              onSuccess: () => toast.success(`${label} marked as paid, ${slip.name} stored`),
              onError: (err) =>
                toast.error(`Payment saved, but ${slip.name} did not upload (${err.message}). Attach it from the Payments tab.`),
              onSettled: onClose,
            },
          );
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
                defaultMinor={target.balanceMinor}
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
            <Label htmlFor="mp-slip">Invoice or payment slip</Label>
            {slip ? (
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{slip.name}</span>
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${slip.name}`} onClick={() => setSlip(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <Input
                id="mp-slip"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.zip"
                className="file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const problem = fileProblem(file);
                  setError(problem);
                  if (!problem) setSlip(file);
                  e.target.value = '';
                }}
              />
            )}
            <p className="text-xs text-text-muted">Optional. PDF, image or Office file up to 25 MB; stored with the payment.</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={markPaid.isPending || attach.isPending}>
              {attach.isPending ? 'Uploading…' : 'Save payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
