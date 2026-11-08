import { todayIn } from '@salescrm/core';
import { paymentDtoSchema } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, toast } from '@salescrm/ui';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatApiMoney } from '../../lib/money';
import { useSettings } from '../settings/api';
import { useRefreshAfterPayment } from './api';
import { type MarkPaidTarget } from './MarkPaidDialog';

interface Row {
  target: MarkPaidTarget;
  date: string;
  invoiceId: string;
  /** One key per milestone for the life of the popup: saving again after a failure never pays twice. */
  key: string;
}

const plural = (n: number) => `${n} milestone${n === 1 ? '' : 's'}`;

/**
 * D-058: several milestones marked paid together, each for its balance on its own date (starting at its due date, the
 * date read from its invoice, or today when that is still ahead). One that is refused stays here with the reason.
 */
export function BulkPayDialog({ targets, onClose }: { targets: MarkPaidTarget[]; onClose: () => void }) {
  const today = todayIn(useSettings().data?.timezone ?? 'Asia/Kolkata', new Date());
  const refresh = useRefreshAfterPayment();
  const [rows, setRows] = useState<Row[]>(() =>
    targets.map((t) => ({
      target: t,
      date: t.dueDate && t.dueDate <= today ? t.dueDate : today,
      invoiceId: t.invoiceId ?? '',
      key: crypto.randomUUID(),
    })),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [count] = useState(targets.length);
  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.target.milestoneId === id ? { ...r, ...patch } : r)));

  const save = async () => {
    const bad = rows.find((r) => !r.date || r.date > today);
    if (bad) return setErrors([`M${bad.target.number}: choose a paid date that is not in the future.`]);
    setSaving(true);
    const failed: Row[] = [];
    const messages: string[] = [];
    // One after another, so the server checks each balance and rate in turn.
    for (const r of rows) {
      try {
        await apiFetch(`/milestones/${r.target.milestoneId}/payments`, {
          method: 'POST',
          body: {
            milestoneLabel: `M${r.target.number}`,
            ...(r.invoiceId.trim() ? { invoiceId: r.invoiceId.trim() } : {}),
            paymentDate: r.date,
            amountMinor: r.target.balanceMinor,
          },
          schema: paymentDtoSchema,
          headers: { 'Idempotency-Key': r.key },
        });
      } catch (e) {
        failed.push(r);
        messages.push(`M${r.target.number}: ${e instanceof Error ? e.message : 'could not be saved'}`);
      }
    }
    setSaving(false);
    refresh();
    const done = rows.length - failed.length;
    if (failed.length === 0) {
      toast.success(`${plural(done)} marked as paid`);
      return onClose();
    }
    if (done > 0) toast.success(`${plural(done)} marked as paid; ${failed.length} need attention`);
    setRows(failed);
    setErrors(messages);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Mark {plural(count)} as paid</DialogTitle>
        <DialogDescription>
          Each is paid in full on its own date. The dates start at each invoice date; change any of them.
        </DialogDescription>
        <div className="mt-4 max-h-[55dvh] space-y-2 overflow-y-auto">
          <div className="grid grid-cols-[3rem_1fr_9rem_10rem] gap-2 px-1 text-xs text-text-muted">
            <span>#</span>
            <span>Invoice ID</span>
            <span className="text-right">Amount</span>
            <span>Paid on</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.target.milestoneId}
              className="grid grid-cols-[3rem_1fr_9rem_10rem] items-center gap-2 rounded-lg bg-surface-raised px-1 py-1.5"
            >
              <span className="font-medium" title={r.target.title}>
                M{r.target.number}
              </span>
              <Input
                aria-label={`M${r.target.number} invoice ID`}
                placeholder="Optional"
                value={r.invoiceId}
                onChange={(e) => set(r.target.milestoneId, { invoiceId: e.target.value })}
              />
              <span className="text-right text-sm tabular-nums">{formatApiMoney(r.target.balanceMinor, r.target.currency)}</span>
              <Input
                aria-label={`M${r.target.number} paid on`}
                type="date"
                max={today}
                value={r.date}
                onChange={(e) => set(r.target.milestoneId, { date: e.target.value })}
              />
            </div>
          ))}
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="mt-3 space-y-1 text-sm text-danger">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Mark all as paid'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
