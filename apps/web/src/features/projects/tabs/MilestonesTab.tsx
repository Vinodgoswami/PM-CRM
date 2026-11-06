import { can } from '@salescrm/auth/permissions';
import { type ProjectDetail } from '@salescrm/schemas';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@salescrm/ui';
import { ArrowDown, ArrowUp, BadgeCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatDate } from '../../../lib/dates';
import { formatApiMoney } from '../../../lib/money';
import { useSession } from '../../auth/api';
import { MarkPaidDialog, type MarkPaidTarget } from '../../payments/MarkPaidDialog';
import { MilestoneStatusBadge } from '../../payments/MilestoneStatusBadge';
import { parseInvoiceText } from '../../payments/invoice-text';
import { readPdfText } from '../../payments/readPdfText';
import { SlipDropzone } from '../../payments/SlipDropzone';
import { projectKeys, /* uploadDocument, */ useDeleteMilestone, useReorderMilestones, useResetMilestone, useUpdateMilestone } from '../api';
import { projectDetailSchema } from '@salescrm/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import { OptionSelect } from '../../../components/OptionSelect';
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
                <TD className="max-w-64 truncate">
                  {m.title}
                  {m.isUpsell && <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium">Upsell</span>}
                </TD>
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
      {project.canEdit && <AddMilestone project={project} openAtStart={params.has('add')} />}
      {paying && <MarkPaidDialog target={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

/**
 * D-038: a milestone is added to this project or one of its phases, and is either part of the contract or an upsell
 * (an upsell amount billed through this new milestone).
 */
function AddMilestone({ project, openAtStart }: { project: ProjectDetail; openAtStart: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(openAtStart);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<{ minor: number | null; error: string | null }>({ minor: null, error: null });
  const [due, setDue] = useState('');
  const [target, setTarget] = useState(project.id);
  const [kind, setKind] = useState<'CONTRACT' | 'UPSELL'>('CONTRACT');
  const [key, setKey] = useState(0);
  const [invoice, setInvoice] = useState<File | null>(null);
  const [filled, setFilled] = useState<string | null>(null);
  const [amountShown, setAmountShown] = useState<{ key: number; minor?: number }>({ key: 0 });
  const phases = project.upsellProjects;
  const where = target === project.id ? null : phases.find((u) => u.id === target);
  const add = useMutation({
    mutationFn: () =>
      kind === 'UPSELL'
        ? apiFetch(`/projects/${target}/upsells`, {
            method: 'POST',
            body: { amountMinor: amount.minor!, date: new Date().toISOString().slice(0, 10), note: title.trim(), dueDate: due },
            schema: projectDetailSchema,
          })
        : apiFetch(`/projects/${target}/milestones`, {
            method: 'POST',
            body: { title, amountMinor: amount.minor!, ...(due ? { dueDate: due } : {}) },
            schema: projectDetailSchema,
          }),
    onSuccess: (updated) => {
      qc.setQueryData(projectKeys.detail(updated.id), updated);
      for (const k of [['projects'], ['dashboard'], ['invoices']]) void qc.invalidateQueries({ queryKey: k });
    },
  });
  // D-041: an invoice PDF fills the fields (read in the browser). No payment is recorded. D-043: not stored for now.
  const chooseInvoice = async (file: File | null) => {
    setInvoice(file);
    setFilled(null);
    if (!file || file.type !== 'application/pdf') return;
    let fields: ReturnType<typeof parseInvoiceText> = {};
    try {
      fields = parseInvoiceText(await readPdfText(file), project.currency);
    } catch {
      /* unreadable PDF: treated like one without text */
    }
    const got: string[] = [];
    if (fields.invoiceId && !title.trim()) {
      setTitle(`Invoice ${fields.invoiceId}`);
      got.push('task');
    }
    if (fields.amountMinor !== undefined) {
      setAmount({ minor: fields.amountMinor, error: null });
      setAmountShown((a) => ({ key: a.key + 1, minor: fields.amountMinor }));
      got.push('amount');
    }
    if (fields.dueDate) {
      setDue(fields.dueDate);
      got.push('due date');
    }
    setFilled(
      got.length
        ? `Filled from ${file.name}: ${got.join(', ')}. Check them before adding.`
        : `No details could be read from ${file.name} (a scan or photo has no text). Enter them below.`,
    );
  };
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
      className="space-y-3 rounded-lg bg-surface p-4 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return toast.error('Enter the milestone task');
        if (amount.minor === null) return toast.error(amount.error ?? 'Enter an amount');
        if (!due) return toast.error('Choose a due date');
        add.mutate(undefined, {
          onSuccess: () => {
            // D-043: storing the invoice is paused for now; it is only read. Uncomment to store it again.
            // if (invoice) {
            //   const stored = invoice;
            //   uploadDocument(target, stored, 'INVOICE').then(
            //     () => void qc.invalidateQueries({ queryKey: projectKeys.documents(target) }),
            //     (err: Error) => toast.error(`Milestone added, but ${stored.name} could not be stored: ${err.message}`),
            //   );
            // }
            setInvoice(null);
            setFilled(null);
            setAmountShown((a) => ({ key: a.key + 1 }));
            setTitle('');
            setDue('');
            setAmount({ minor: null, error: null });
            setKey((k) => k + 1);
            toast.success(where ? `Milestone added to Phase ${where.phase}` : 'Milestone added');
          },
          onError: (err) => toast.error(err.message),
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {phases.length > 0 && (
          <OptionSelect
            id="new-milestone-phase"
            aria-label="Milestone phase"
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={target}
            onValueChange={setTarget}
          >
            <option value={project.id}>Phase 1 · {project.name} (this project)</option>
            {phases.map((u) => (
              <option key={u.id} value={u.id}>
                Phase {u.phase} · {u.name} ({u.phaseKind === 'SCOPE' ? 'scope part' : 'upsell'})
              </option>
            ))}
          </OptionSelect>
        )}
        <OptionSelect
          id="new-milestone-type"
          aria-label="Milestone type"
          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
          value={kind}
          onValueChange={(v) => setKind(v as 'CONTRACT' | 'UPSELL')}
        >
          <option value="CONTRACT">Contract — part of the booked amount</option>
          <option value="UPSELL">Upsell — new work, adds to the booking</option>
        </OptionSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-milestone-invoice">Milestone invoice (optional)</Label>
        <SlipDropzone
          id="new-milestone-invoice"
          file={invoice}
          onChange={(f) => void chooseInvoice(f)}
          onError={(m) => m && toast.error(m)}
        />
        {filled && (
          <p role="status" className="text-xs text-text-muted">
            {filled}
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-start">
        <Input aria-label="New milestone task" placeholder="Task" value={title} onChange={(e) => setTitle(e.target.value)} />
        <MoneyInput
          key={amountShown.key}
          aria-label="New milestone amount"
          currency={project.currency}
          defaultMinor={amountShown.minor}
          onValue={(minor, error) => setAmount({ minor, error })}
        />
        <Input aria-label="New milestone due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <div className="flex gap-2">
          <Button type="submit" disabled={add.isPending}>
            Add
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </div>
      {kind === 'UPSELL' && (
        <p className="text-xs text-text-muted">Adds this amount to the booking as an upsell and bills it through this milestone.</p>
      )}
    </form>
  );
}

function EditRow({ project, milestone, onDone }: { project: ProjectDetail; milestone: Milestone; onDone: () => void }) {
  const update = useUpdateMilestone(project.id);
  const reset = useResetMilestone();
  const [title, setTitle] = useState(milestone.title);
  const [amount, setAmount] = useState<{ minor: number | null; error: string | null }>({ minor: milestone.amountMinor, error: null });
  const [due, setDue] = useState(milestone.dueDate ?? '');
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const money = (m: number) => formatApiMoney(m, project.currency);

  const save = (minor: number) =>
    update.mutate(
      { milestoneId: milestone.id, title, amountMinor: minor, dueDate: due || null },
      { onSuccess: onDone, onError: (e) => toast.error(e.message) },
    );

  return (
    <TR className="bg-accent/40">
      <TD className="font-medium">M{milestone.number}</TD>
      <TD>
        <Input aria-label={`M${milestone.number} task`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </TD>
      <TD className="min-w-40">
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
          disabled={update.isPending || reset.isPending}
          onClick={() => {
            if (amount.minor === null) return toast.error(amount.error ?? 'Enter an amount');
            // D-027: a paid milestone's amount changes only after its payments are reset (reversed, kept in history).
            if (amount.minor !== milestone.amountMinor && milestone.paidMinor > 0) return setConfirming(true);
            save(amount.minor);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {confirming && (
          <Dialog open onOpenChange={(o) => !o && setConfirming(false)}>
            <DialogContent>
              <DialogTitle>Reset paid milestone?</DialogTitle>
              <DialogDescription>
                M{milestone.number} {milestone.title} has {money(milestone.paidMinor)} paid. Saving the new amount reverses those payments:
                they stay in the payment history as reversals and the milestone becomes unpaid, so record the payment again afterwards if it
                still stands.
              </DialogDescription>
              <form
                noValidate
                className="mt-4 space-y-4 text-left"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reason.trim()) return toast.error('Give a reason for the reset');
                  reset.mutate(
                    { milestoneId: milestone.id, reason: reason.trim() },
                    {
                      onSuccess: () => {
                        setConfirming(false);
                        save(amount.minor!);
                      },
                      onError: (e) => toast.error(e.message),
                    },
                  );
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="reset-reason">Reason</Label>
                  <Input
                    id="reset-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Scope reduced after client review"
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                    Keep payments
                  </Button>
                  <Button type="submit" variant="danger" disabled={reset.isPending}>
                    Reset and save
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </TD>
    </TR>
  );
}
