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

/** D-062: one grid for the header, rows and total so the columns line up. */
const GRID = 'grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7.5rem_9.5rem] gap-3';

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
  // D-062: which one is being saved (1-based) and which are already paid, shown on the rows and the button.
  const [current, setCurrent] = useState(0);
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const [count] = useState(targets.length);
  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.target.milestoneId === id ? { ...r, ...patch } : r)));

  const save = async () => {
    const bad = rows.find((r) => !r.date || r.date > today);
    if (bad) return setErrors([`M${bad.target.number}: choose a paid date that is not in the future.`]);
    setSaving(true);
    const failed: Row[] = [];
    const messages: string[] = [];
    // One after another, so the server checks each balance and rate in turn.
    for (const [i, r] of rows.entries()) {
      setCurrent(i + 1);
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
        setPaid((s) => new Set(s).add(r.target.milestoneId));
      } catch (e) {
        failed.push(r);
        messages.push(`M${r.target.number}: ${e instanceof Error ? e.message : 'could not be saved'}`);
      }
    }
    setSaving(false);
    setCurrent(0);
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
      <DialogContent className="max-w-3xl">
        <DialogTitle>Mark {plural(count)} as paid</DialogTitle>
        <DialogDescription>
          Each is paid in full on its own date. The dates start at each invoice date; change any of them.
        </DialogDescription>
        <div className="mt-5 overflow-hidden rounded-xl border border-border bg-surface-raised">
          <div className={`${GRID} border-b border-border px-4 py-2 text-xs font-medium text-text-muted`}>
            <span>Milestone</span>
            <span>Invoice ID</span>
            <span className="text-right">Amount</span>
            <span>Paid on</span>
          </div>
          <ul className="max-h-[50dvh] divide-y divide-border overflow-y-auto">
            {rows.map((r, i) => {
              const id = r.target.milestoneId;
              const state = paid.has(id) ? 'paid' : saving && current === i + 1 ? 'saving' : null;
              return (
                <li key={id} className={`${GRID} items-center px-4 py-3`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      M{r.target.number}
                      {state === 'paid' && (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">Paid</span>
                      )}
                      {state === 'saving' && <span className="text-xs font-normal text-text-muted">Saving…</span>}
                    </p>
                    <p className="truncate text-xs text-text-muted" title={r.target.title}>
                      {r.target.title}
                    </p>
                  </div>
                  <Input
                    aria-label={`M${r.target.number} invoice ID`}
                    placeholder="Optional"
                    className="h-9"
                    disabled={saving}
                    value={r.invoiceId}
                    onChange={(e) => set(id, { invoiceId: e.target.value })}
                  />
                  <span className="text-right text-sm font-medium tabular-nums">
                    {formatApiMoney(r.target.balanceMinor, r.target.currency)}
                  </span>
                  <Input
                    aria-label={`M${r.target.number} paid on`}
                    type="date"
                    className="h-9"
                    max={today}
                    disabled={saving}
                    value={r.date}
                    onChange={(e) => set(id, { date: e.target.value })}
                  />
                </li>
              );
            })}
          </ul>
          <div className={`${GRID} border-t border-border px-4 py-2.5 text-sm font-semibold`}>
            <span>Total</span>
            <span />
            <span className="text-right tabular-nums">
              {formatApiMoney(
                rows.reduce((t, r) => t + r.target.balanceMinor, 0),
                rows[0]?.target.currency ?? 'INR',
              )}
            </span>
            <span />
          </div>
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
            {saving ? `Saving ${current} of ${rows.length}…` : 'Mark all as paid'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
