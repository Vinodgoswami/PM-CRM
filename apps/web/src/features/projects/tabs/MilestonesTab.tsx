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
import { useEditPayment } from '../../payments/api';
import { useMarkPaidFlow } from '../../payments/useMarkPaidFlow';
import { BulkPayDialog } from '../../payments/BulkPayDialog';
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
import { useConfirm } from '../../../components/ConfirmDialog';

type Milestone = ProjectDetail['milestones'][number];

/** D-056: pinned to the right edge with a solid background, so scrolled cells pass under it. */
const PIN = 'sticky right-0 z-10 bg-surface-solid shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.25)]';

export function MilestonesTab({ project }: { project: ProjectDetail }) {
  const { data: session } = useSession();
  // P-8: payments only on won work; the server enforces the same rule.
  const booked = ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'].includes(project.status);
  const canPay = booked && project.canEdit && !!session && can(session.user, 'payments.create', { ownerId: project.owner.id });
  const money = (m: number) => formatApiMoney(m, project.currency);
  const pay = useMarkPaidFlow();
  const confirm = useConfirm();
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
  // D-058: tick unpaid milestones and mark them paid together, each on its own date.
  const unpaid = canPay ? project.milestones.filter((m) => m.balanceMinor > 0) : [];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const selected = unpaid.filter((m) => picked.has(m.id));
  const [bulk, setBulk] = useState(false);
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const columns = canPay ? 11 : 10;
  const totals = project.milestones.reduce((s, m) => ({ amount: s.amount + m.amountMinor, paid: s.paid + m.paidMinor }), {
    amount: 0,
    paid: 0,
  });

  return (
    <div className="space-y-4">
      {selected.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} selected</span>
          <Button size="sm" className="ml-auto" onClick={() => setBulk(true)}>
            <BadgeCheck className="size-4" /> Mark {selected.length} as paid
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Clear
          </Button>
        </div>
      )}
      <Table>
        <THead>
          <TR>
            {canPay && (
              <TH className="w-8">
                {unpaid.length > 1 && (
                  <input
                    type="checkbox"
                    aria-label="Select all unpaid"
                    className="size-4 accent-primary"
                    checked={selected.length === unpaid.length}
                    onChange={(e) => setPicked(e.target.checked ? new Set(unpaid.map((m) => m.id)) : new Set())}
                  />
                )}
              </TH>
            )}
            <TH>#</TH>
            <TH>Invoice ID</TH>
            <TH>Task</TH>
            <TH className="text-right">Amount</TH>
            <TH>Due</TH>
            <TH className="text-right">Paid</TH>
            <TH>Paid on</TH>
            <TH className="text-right">Balance</TH>
            <TH>Status</TH>
            {/* D-056: the actions stay in view while the other columns scroll under them. */}
            <TH className={`${PIN} text-right`}>Actions</TH>
          </TR>
        </THead>
        <TBody>
          {project.milestones.length === 0 && (
            <TR>
              <TD colSpan={columns} className="py-6 text-center text-text-muted">
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
                selectable={canPay}
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
                {canPay && (
                  <TD>
                    {m.balanceMinor > 0 && (
                      <input
                        type="checkbox"
                        aria-label={`Select M${m.number}`}
                        className="size-4 accent-primary"
                        checked={picked.has(m.id)}
                        onChange={() => toggle(m.id)}
                      />
                    )}
                  </TD>
                )}
                <TD className="font-medium">M{m.number}</TD>
                <TD className="whitespace-nowrap">{m.invoiceId ?? <span className="text-text-muted">—</span>}</TD>
                <TD className="max-w-64 truncate">
                  {m.title}
                  {m.isUpsell && <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium">Upsell</span>}
                  {m.recurringSeriesId && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Recurring</span>
                  )}
                </TD>
                <TD className="text-right tabular-nums">{money(m.amountMinor)}</TD>
                <TD>{formatDate(m.dueDate)}</TD>
                <TD className="text-right tabular-nums">{money(m.paidMinor)}</TD>
                <TD className="whitespace-nowrap">{m.paidOn ? formatDate(m.paidOn) : <span className="text-text-muted">—</span>}</TD>
                <TD className="text-right font-medium tabular-nums">{money(m.balanceMinor)}</TD>
                <TD>
                  <MilestoneStatusBadge status={m.status} />
                </TD>
                <TD className={`${PIN} space-x-1 text-right`}>
                  {canPay && m.balanceMinor > 0 && (
                    <Button
                      size="sm"
                      aria-label={`Mark M${m.number} as paid`}
                      onClick={() =>
                        pay.start({
                          milestoneId: m.id,
                          number: m.number,
                          title: m.title,
                          invoiceId: m.invoiceId,
                          dueDate: m.dueDate,
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
                            void confirm({
                              title: `Delete M${m.number}?`,
                              message: `Do you really want to delete M${m.number} ${m.title}? This cannot be undone.`,
                            }).then((ok) => ok && del.mutate(m.id, { onError: (e) => toast.error(e.message) }))
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
              <TD colSpan={canPay ? 4 : 3}>Total</TD>
              <TD className="text-right tabular-nums">{money(totals.amount)}</TD>
              <TD />
              <TD className="text-right tabular-nums">{money(totals.paid)}</TD>
              <TD />
              <TD className="text-right tabular-nums">{money(totals.amount - totals.paid)}</TD>
              <TD />
              <TD className={PIN} />
            </TR>
          )}
        </TBody>
      </Table>
      {project.recurring.length > 0 && <RecurringList project={project} />}
      {project.canEdit && <AddMilestone project={project} openAtStart={params.has('add')} />}
      {pay.dialog}
      {bulk && (
        <BulkPayDialog
          targets={selected.map((m) => ({
            milestoneId: m.id,
            number: m.number,
            title: m.title,
            invoiceId: m.invoiceId,
            dueDate: m.dueDate,
            balanceMinor: m.balanceMinor,
            currency: project.currency,
          }))}
          onClose={() => {
            setBulk(false);
            setPicked(new Set());
          }}
        />
      )}
    </div>
  );
}

/** D-063: the project's monthly recurring milestones, with how far each has got; extend or stop them. */
function RecurringList({ project }: { project: ProjectDetail }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [extending, setExtending] = useState<string | null>(null);
  const [months, setMonths] = useState('12');
  const money = (m: number) => formatApiMoney(m, project.currency);
  const act = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: 'extend' | 'stop'; body?: object }) =>
      apiFetch(`/recurring/${id}/${action}`, { method: 'POST', body, schema: projectDetailSchema }),
    onSuccess: (updated) => {
      qc.setQueryData(projectKeys.detail(updated.id), updated);
      for (const k of [['projects'], ['dashboard'], ['invoices']]) void qc.invalidateQueries({ queryKey: k });
    },
  });
  const run = (id: string, action: 'extend' | 'stop', body?: object, done?: string) =>
    act.mutate({ id, action, body }, { onSuccess: () => done && toast.success(done), onError: (e) => toast.error(e.message) });

  return (
    <section aria-label="Recurring milestones" className="space-y-2 rounded-lg bg-surface p-4 shadow-card">
      <h3 className="text-sm font-semibold">Recurring milestones</h3>
      <ul className="divide-y divide-border">
        {project.recurring.map((r) => (
          <li key={r.id} className="space-y-2 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">{r.title}</span>
              <span className="text-text-muted">
                {money(r.amountMinor)} a month · from {formatDate(r.startDate)} · {r.createdCount} of {r.count} created
                {r.nextDate ? ` · next ${formatDate(r.nextDate)}` : ' · complete'}
              </span>
              {project.canEdit && (
                <span className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Extend ${r.title}`}
                    onClick={() => setExtending(extending === r.id ? null : r.id)}
                  >
                    Extend
                  </Button>
                  {r.nextDate && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Stop ${r.title}`}
                      onClick={() =>
                        void confirm({
                          title: `Stop ${r.title}?`,
                          message: `Do you really want to stop ${r.title}? The ${r.createdCount} invoices already created stay; no more are added.`,
                          confirmLabel: 'Stop',
                        }).then((ok) => ok && run(r.id, 'stop', undefined, `${r.title} stopped`))
                      }
                    >
                      Stop
                    </Button>
                  )}
                </span>
              )}
            </div>
            {extending === r.id && (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(months);
                  if (!Number.isInteger(n) || n < 1 || n > 120) return toast.error('Enter 1–120 months');
                  run(r.id, 'extend', { months: n }, `${r.title} extended by ${n} months`);
                  setExtending(null);
                }}
              >
                <Input
                  aria-label="Months to add"
                  type="number"
                  min={1}
                  max={120}
                  className="h-9 w-28"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                />
                <Button size="sm" type="submit" disabled={act.isPending}>
                  Add months
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
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
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState<{ minor: number | null; error: string | null }>({ minor: null, error: null });
  const [due, setDue] = useState('');
  const [target, setTarget] = useState(project.id);
  const [kind, setKind] = useState<'CONTRACT' | 'UPSELL'>('CONTRACT');
  // D-063: a monthly recurring milestone: first invoice date and how many invoices.
  const [recurring, setRecurring] = useState(false);
  const [start, setStart] = useState('');
  const [count, setCount] = useState('12');
  const [key, setKey] = useState(0);
  const [invoice, setInvoice] = useState<File | null>(null);
  const [filled, setFilled] = useState<string | null>(null);
  const [amountShown, setAmountShown] = useState<{ key: number; minor?: number }>({ key: 0 });
  const phases = project.upsellProjects;
  const where = target === project.id ? null : phases.find((u) => u.id === target);
  // MS-5: a contract milestone fits in what is left of the project's value; a phase's own limit is checked by the server.
  const left = target === project.id ? Math.max(0, project.unscheduledMinor) : null;
  const money = (m: number) => formatApiMoney(m, project.currency);
  const add = useMutation({
    mutationFn: () =>
      recurring
        ? apiFetch(`/projects/${target}/recurring`, {
            method: 'POST',
            body: { title: title.trim(), amountMinor: amount.minor!, startDate: start, count: Number(count) },
            schema: projectDetailSchema,
          })
        : kind === 'UPSELL'
          ? apiFetch(`/projects/${target}/upsells`, {
              method: 'POST',
              body: { amountMinor: amount.minor!, date: new Date().toISOString().slice(0, 10), note: title.trim(), dueDate: due },
              schema: projectDetailSchema,
            })
          : apiFetch(`/projects/${target}/milestones`, {
              method: 'POST',
              body: {
                title,
                ...(invoiceId.trim() ? { invoiceId: invoiceId.trim() } : {}),
                amountMinor: amount.minor!,
                ...(due ? { dueDate: due } : {}),
              },
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
    // D-049: the invoice ID is optional; it is filled only when the PDF has one (else a payment can bring it, D-048).
    if (fields.invoiceId) {
      setInvoiceId(fields.invoiceId);
      got.push('invoice ID');
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
        if (recurring) {
          const n = Number(count);
          if (!start) return toast.error('Choose the first invoice date');
          if (!Number.isInteger(n) || n < 1 || n > 120) return toast.error('Enter the number of invoices (1–120)');
          if (left !== null && amount.minor * n > left)
            return toast.error(`${n} invoices of ${money(amount.minor)} is more than the ${money(left)} left in this project's value.`);
        } else if (!due) return toast.error('Choose a due date');
        if (!recurring && kind === 'CONTRACT' && left !== null && amount.minor > left)
          return toast.error(`That's more than the ${money(left)} left in this project's value. Lower it, or add the extra as an Upsell.`);
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
            setInvoiceId('');
            setDue('');
            setStart('');
            setAmount({ minor: null, error: null });
            setKey((k) => k + 1);
            toast.success(
              recurring
                ? 'Recurring milestone added: invoices due so far are created now, the rest on their dates'
                : where
                  ? `Milestone added to Phase ${where.phase}`
                  : 'Milestone added',
            );
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
        {!recurring && (
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
        )}
      </div>
      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={recurring}
          onChange={(e) => {
            setRecurring(e.target.checked);
            if (e.target.checked) setKind('CONTRACT');
          }}
        />
        Recurring monthly
      </label>
      {!recurring && (
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
      )}
      {recurring && (
        <div aria-hidden className="hidden gap-2 text-xs text-text-muted sm:grid sm:grid-cols-[1fr_12rem_10rem_8rem_auto]">
          <span>Task</span>
          <span>Amount per invoice</span>
          <span>First invoice date</span>
          <span>No. of invoices</span>
          <span />
        </div>
      )}
      <div
        className={`grid gap-2 sm:items-start ${recurring ? 'sm:grid-cols-[1fr_12rem_10rem_8rem_auto]' : 'sm:grid-cols-[11rem_1fr_12rem_10rem_auto]'}`}
      >
        {!recurring && (
          <Input
            aria-label="New milestone invoice ID (optional)"
            placeholder="Invoice ID (optional)"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
          />
        )}
        <Input aria-label="New milestone task" placeholder="Task" value={title} onChange={(e) => setTitle(e.target.value)} />
        <MoneyInput
          key={amountShown.key}
          aria-label={recurring ? 'Amount per invoice' : 'New milestone amount'}
          currency={project.currency}
          defaultMinor={amountShown.minor}
          onValue={(minor, error) => setAmount({ minor, error })}
        />
        {recurring ? (
          <>
            <Input
              aria-label="First invoice date"
              type="date"
              title="First invoice date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <Input
              aria-label="Number of invoices"
              type="number"
              min={1}
              max={120}
              title="Number of invoices"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </>
        ) : (
          <Input aria-label="New milestone due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={add.isPending}>
            Add
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </div>
      {recurring && (
        <p className="text-xs text-text-muted">
          One invoice a month on the first invoice date&apos;s day. Invoices due up to today are created now; each later one appears on its
          date.
        </p>
      )}
      {kind === 'CONTRACT' && left !== null && <p className="text-xs text-text-muted">{money(left)} left to put in milestones</p>}
      {kind === 'UPSELL' && (
        <p className="text-xs text-text-muted">Adds this amount to the booking as an upsell and bills it through this milestone.</p>
      )}
    </form>
  );
}

function EditRow({
  project,
  milestone,
  selectable,
  onDone,
}: {
  project: ProjectDetail;
  milestone: Milestone;
  /** D-058: the table has a tick-box column first. */
  selectable: boolean;
  onDone: () => void;
}) {
  const update = useUpdateMilestone(project.id);
  const reset = useResetMilestone();
  const [title, setTitle] = useState(milestone.title);
  const [invoiceId, setInvoiceId] = useState(milestone.invoiceId ?? '');
  const [amount, setAmount] = useState<{ minor: number | null; error: string | null }>({ minor: milestone.amountMinor, error: null });
  const [due, setDue] = useState(milestone.dueDate ?? '');
  // D-055: when it was paid is the date of its latest payment; changing it here corrects that payment (and the charts).
  const [paidOn, setPaidOn] = useState(milestone.paidOn ?? '');
  const editPayment = useEditPayment(milestone.paidPaymentId ?? '');
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const money = (m: number) => formatApiMoney(m, project.currency);

  const saveMilestone = (minor: number) =>
    update.mutate(
      { milestoneId: milestone.id, title, invoiceId: invoiceId.trim() || null, amountMinor: minor, dueDate: due || null },
      { onSuccess: onDone, onError: (e) => toast.error(e.message) },
    );
  const save = (minor: number) => {
    if (!milestone.paidPaymentId || !paidOn || paidOn === milestone.paidOn) return saveMilestone(minor);
    editPayment.mutate({ paymentDate: paidOn }, { onSuccess: () => saveMilestone(minor), onError: (e) => toast.error(e.message) });
  };

  return (
    <TR className="bg-accent/40">
      {selectable && <TD />}
      <TD className="font-medium">M{milestone.number}</TD>
      <TD>
        <Input aria-label={`M${milestone.number} invoice ID`} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
      </TD>
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
      <TD className="text-right tabular-nums">{money(milestone.paidMinor)}</TD>
      <TD>
        {milestone.paidPaymentId && (
          <Input aria-label={`M${milestone.number} paid on`} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        )}
      </TD>
      <TD colSpan={2} />
      <TD className={`${PIN} space-x-2 text-right`}>
        <Button
          size="sm"
          disabled={update.isPending || reset.isPending || editPayment.isPending}
          onClick={() => {
            if (amount.minor === null) return toast.error(amount.error ?? 'Enter an amount');
            // MS-5: the milestones together stay within the project's value.
            const room = project.unscheduledMinor + milestone.amountMinor;
            if (amount.minor > room)
              return toast.error(`That's more than the project's value allows: M${milestone.number} can be at most ${money(room)}.`);
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
                        saveMilestone(amount.minor!);
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
