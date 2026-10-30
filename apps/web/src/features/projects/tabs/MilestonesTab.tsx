import { can } from '@salescrm/auth/permissions';
import { type ProjectDetail } from '@salescrm/schemas';
import { Button, Input, Table, TBody, TD, TH, THead, TR, toast } from '@salescrm/ui';
import { ArrowDown, ArrowUp, BadgeCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatDate } from '../../../lib/dates';
import { formatApiMoney } from '../../../lib/money';
import { useSession } from '../../auth/api';
import { MarkPaidDialog, type MarkPaidTarget } from '../../payments/MarkPaidDialog';
import { MilestoneStatusBadge } from '../../payments/MilestoneStatusBadge';
import { useAddMilestone, useDeleteMilestone, useReorderMilestones, useUpdateMilestone } from '../api';
import { MoneyInput } from '../MoneyInput';

type Milestone = ProjectDetail['milestones'][number];

export function MilestonesTab({ project }: { project: ProjectDetail }) {
  const { data: session } = useSession();
  // P-8: payments only on won work; the server enforces the same rule.
  const booked = ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'].includes(project.status);
  const canPay = booked && project.canEdit && !!session && can(session.user, 'payments.create', { ownerId: project.owner.id });
  const money = (m: number) => formatApiMoney(m, project.currency);
  const [paying, setPaying] = useState<MarkPaidTarget | null>(null);
  // Upcoming Invoices links here with ?edit=<milestone id> to open that row ready to change.
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<string | null>(() => (project.canEdit ? params.get('edit') : null));
  const del = useDeleteMilestone(project.id);
  const reorder = useReorderMilestones(project.id);
  const ids = project.milestones.map((m) => m.id);
  const move = (i: number, by: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    reorder.mutate(next, { onError: (e) => toast.error(e.message) });
  };
  const totals = project.milestones.reduce((s, m) => ({ amount: s.amount + m.amountMinor, paid: s.paid + m.paidMinor }), {
    amount: 0,
    paid: 0,
  });

  return (
    <div className="space-y-4">
      <Table>
        <THead>
          <TR>
            <TH>#</TH>
            <TH>Task</TH>
            <TH className="text-right">Amount</TH>
            <TH>Due</TH>
            <TH className="text-right">Paid</TH>
            <TH className="text-right">Balance</TH>
            <TH>Status</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {project.milestones.length === 0 && (
            <TR>
              <TD colSpan={8} className="py-6 text-center text-text-muted">
                No milestones yet.
              </TD>
            </TR>
          )}
          {project.milestones.map((m, i) =>
            editing === m.id ? (
              <EditRow
                key={m.id}
                project={project}
                milestone={m}
                onDone={() => {
                  setEditing(null);
                  if (params.has('edit'))
                    setParams(
                      (p) => {
                        p.delete('edit');
                        return p;
                      },
                      { replace: true },
                    );
                }}
              />
            ) : (
              <TR key={m.id}>
                <TD className="font-medium">M{m.number}</TD>
                <TD className="max-w-64 truncate">{m.title}</TD>
                <TD className="text-right tabular-nums">{money(m.amountMinor)}</TD>
                <TD>{formatDate(m.dueDate)}</TD>
                <TD className="text-right tabular-nums">{money(m.paidMinor)}</TD>
                <TD className="text-right font-medium tabular-nums">{money(m.balanceMinor)}</TD>
                <TD>
                  <MilestoneStatusBadge status={m.status} />
                </TD>
                <TD className="space-x-1 text-right">
                  {canPay && m.balanceMinor > 0 && (
                    <Button
                      size="sm"
                      aria-label={`Mark M${m.number} as paid`}
                      onClick={() =>
                        setPaying({
                          milestoneId: m.id,
                          number: m.number,
                          title: m.title,
                          balanceMinor: m.balanceMinor,
                          currency: project.currency,
                        })
                      }
                    >
                      <BadgeCheck className="size-4" /> Mark as paid
                    </Button>
                  )}
                  {project.canEdit && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move M${m.number} up`}
                        disabled={i === 0 || reorder.isPending}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move M${m.number} down`}
                        disabled={i === ids.length - 1 || reorder.isPending}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Edit M${m.number}`} onClick={() => setEditing(m.id)}>
                        <Pencil className="size-4" />
                      </Button>
                      {m.paidMinor === 0 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete M${m.number}`}
                          onClick={() =>
                            window.confirm(`Delete M${m.number} ${m.title}?`) &&
                            del.mutate(m.id, { onError: (e) => toast.error(e.message) })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </>
                  )}
                </TD>
              </TR>
            ),
          )}
          {project.milestones.length > 0 && (
            <TR className="font-semibold hover:bg-transparent">
              <TD colSpan={2}>Total</TD>
              <TD className="text-right tabular-nums">{money(totals.amount)}</TD>
              <TD />
              <TD className="text-right tabular-nums">{money(totals.paid)}</TD>
              <TD className="text-right tabular-nums">{money(totals.amount - totals.paid)}</TD>
              <TD colSpan={2} />
            </TR>
          )}
        </TBody>
      </Table>
      {project.canEdit && <AddMilestone project={project} />}
      {paying && <MarkPaidDialog target={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function AddMilestone({ project }: { project: ProjectDetail }) {
  const add = useAddMilestone(project.id);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<{ minor: number | null; error: string | null }>({ minor: null, error: null });
  const [due, setDue] = useState('');
  const [key, setKey] = useState(0);
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add milestone
      </Button>
    );
  }
  return (
    <form
      key={key}
      className="grid gap-2 rounded-lg bg-surface p-4 shadow-card sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return toast.error('Enter the milestone task');
        if (amount.minor === null) return toast.error(amount.error ?? 'Enter an amount');
        add.mutate(
          { title, amountMinor: amount.minor, ...(due ? { dueDate: due } : {}) },
          {
            onSuccess: () => {
              setTitle('');
              setDue('');
              setAmount({ minor: null, error: null });
              setKey((k) => k + 1);
              toast.success('Milestone added');
            },
            onError: (err) => toast.error(err.message),
          },
        );
      }}
    >
      <Input aria-label="New milestone task" placeholder="Task" value={title} onChange={(e) => setTitle(e.target.value)} />
      <MoneyInput aria-label="New milestone amount" currency={project.currency} onValue={(minor, error) => setAmount({ minor, error })} />
      <Input aria-label="New milestone due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" disabled={add.isPending}>
          Add
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}

function EditRow({ project, milestone, onDone }: { project: ProjectDetail; milestone: Milestone; onDone: () => void }) {
  const update = useUpdateMilestone(project.id);
  const [title, setTitle] = useState(milestone.title);
  const [amount, setAmount] = useState<{ minor: number | null; error: string | null }>({ minor: milestone.amountMinor, error: null });
  const [due, setDue] = useState(milestone.dueDate ?? '');
  return (
    <TR className="bg-accent/40">
      <TD className="font-medium">M{milestone.number}</TD>
      <TD>
        <Input aria-label={`M${milestone.number} task`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </TD>
      <TD>
        <MoneyInput
          aria-label={`M${milestone.number} amount`}
          currency={project.currency}
          defaultMinor={milestone.amountMinor}
          onValue={(minor, error) => setAmount({ minor, error })}
        />
      </TD>
      <TD>
        <Input aria-label={`M${milestone.number} due date`} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </TD>
      <TD colSpan={4} className="space-x-2 text-right">
        <Button
          size="sm"
          disabled={update.isPending}
          onClick={() => {
            if (amount.minor === null) return toast.error(amount.error ?? 'Enter an amount');
            update.mutate(
              { milestoneId: milestone.id, title, amountMinor: amount.minor, dueDate: due || null },
              { onSuccess: onDone, onError: (e) => toast.error(e.message) },
            );
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </TD>
    </TR>
  );
}
