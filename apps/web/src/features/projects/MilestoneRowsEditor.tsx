import { Button, Input } from '@salescrm/ui';
import { Plus, Trash2 } from 'lucide-react';
import { formatApiMoney } from '../../lib/money';
import { MoneyInput } from './MoneyInput';

export interface MilestoneRow {
  key: number;
  title: string;
  amountMinor: number | null;
  amountError: string | null;
  dueDate: string;
}

let nextKey = 1;
export const emptyRow = (): MilestoneRow => ({ key: nextKey++, title: '', amountMinor: null, amountError: null, dueDate: '' });

/** Create-time milestone rows (R4) with a running total against the expected amount (MS-4). */
export function MilestoneRowsEditor({
  rows,
  onChange,
  expectedMinor,
  currency,
  errors,
}: {
  rows: MilestoneRow[];
  onChange: (rows: MilestoneRow[]) => void;
  expectedMinor: number | null;
  currency: string;
  errors: Record<string, string>;
}) {
  const update = (key: number, patch: Partial<MilestoneRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const scheduled = rows.reduce((s, r) => s + (r.amountMinor ?? 0), 0);
  const left = (expectedMinor ?? 0) - scheduled;

  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">Milestones</legend>
      {rows.map((r, i) => {
        const n = i + 1;
        return (
          <div
            key={r.key}
            className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[4rem_1fr_12rem_10rem_auto] sm:items-start"
          >
            <span className="pt-2 text-sm font-medium text-text-muted">M{n}</span>
            <div>
              <Input
                aria-label={`Milestone ${n} task`}
                placeholder="Task"
                value={r.title}
                onChange={(e) => update(r.key, { title: e.target.value })}
              />
              {errors[`milestones.${i}.title`] && <p className="mt-1 text-sm text-danger">{errors[`milestones.${i}.title`]}</p>}
            </div>
            <div>
              <MoneyInput
                aria-label={`Milestone ${n} amount`}
                currency={currency}
                onValue={(v, err) => update(r.key, { amountMinor: v, amountError: err })}
              />
              {(r.amountError || errors[`milestones.${i}.amountMinor`]) && (
                <p className="mt-1 text-sm text-danger">{r.amountError ?? errors[`milestones.${i}.amountMinor`]}</p>
              )}
            </div>
            <div>
              <Input
                aria-label={`Milestone ${n} due date`}
                type="date"
                value={r.dueDate}
                onChange={(e) => update(r.key, { dueDate: e.target.value })}
              />
              {errors[`milestones.${i}.dueDate`] && <p className="mt-1 text-sm text-danger">{errors[`milestones.${i}.dueDate`]}</p>}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove milestone ${n}`}
              onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => onChange([...rows, emptyRow()])}>
          <Plus className="size-4" /> Add milestone
        </Button>
        {rows.length > 0 && expectedMinor !== null && (
          <p className={`text-sm ${left === 0 ? 'text-success' : 'text-text-muted'}`}>
            {left === 0
              ? 'Milestones add up to the booking amount'
              : left > 0
                ? `${formatApiMoney(left, currency)} not yet in milestones`
                : `Milestones exceed the booking amount by ${formatApiMoney(-left, currency)}`}
          </p>
        )}
      </div>
    </fieldset>
  );
}
