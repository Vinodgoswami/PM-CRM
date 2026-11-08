import { type ProjectDetail } from '@salescrm/schemas';
import { Button, Input, Label, Table, TBody, TD, TH, THead, TR, toast } from '@salescrm/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatDate } from '../../../lib/dates';
import { formatApiMoney } from '../../../lib/money';
import { useAddUpsell, useRemoveUpsell } from '../api';
import { StatusBadge } from '../StatusBadge';
import { ProjectBookingSplit, projectBooking } from '../ProjectBookingSplit';
import { MoneyInput } from '../MoneyInput';
import { useConfirm } from '../../../components/ConfirmDialog';

const today = () => new Date().toISOString().slice(0, 10);

export function UpsellsTab({ project }: { project: ProjectDetail }) {
  const money = (m: number) => formatApiMoney(m, project.currency);
  const remove = useRemoveUpsell(project.id);
  const confirm = useConfirm();
  return (
    <div className="space-y-8">
      <Phases project={project} />
      <section className="space-y-3">
        <h2 className="font-medium">Upsell amounts on this project</h2>
        {project.upsellEntries.length === 0 ? (
          <p className="text-sm text-text-muted">No extra work added yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Note</TH>
                <TH className="text-right">Amount</TH>
                {project.canEdit && <TH className="w-10" />}
              </TR>
            </THead>
            <TBody>
              {project.upsellEntries.map((u) => (
                <TR key={u.id}>
                  <TD>{formatDate(u.date)}</TD>
                  <TD>{u.note ?? '—'}</TD>
                  <TD className="text-right tabular-nums">{money(u.amountMinor)}</TD>
                  {project.canEdit && (
                    <TD>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove extra work amount"
                        onClick={() =>
                          void confirm({
                            title: 'Delete upsell amount?',
                            message: `Do you really want to delete the upsell of ${money(u.amountMinor)}${u.note ? ` (${u.note})` : ''}?`,
                          }).then((ok) => ok && remove.mutate(u.id, { onError: (e) => toast.error(e.message) }))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {project.canEdit && project.wonAt && <AddUpsellForm project={project} />}
      </section>
    </div>
  );
}

/** D-028: the original project is Phase 1; upsell work is added as Phase 2, 3, … with its own booking and milestones. */
function Phases({ project }: { project: ProjectDetail }) {
  const money = (m: number) => formatApiMoney(m, project.currency);
  if (project.parent) {
    return (
      <section className="rounded-lg border border-border bg-accent/40 p-4 text-sm">
        <Link to={`/projects/${project.parent.id}`} className="font-medium text-primary hover:underline">
          Phase {project.phase} of {project.parent.code} {project.parent.name}
        </Link>
        <p className="mt-1 text-text-muted">
          {project.phaseKind === 'SCOPE'
            ? 'A part of the original scope: its booking counts towards the initial booking.'
            : 'Its booking counts as upsell.'}{' '}
          Open the original project to see every phase together.
        </p>
      </section>
    );
  }
  const { initial } = projectBooking(project);
  const nextPhase = project.upsellProjects.length + 2;
  return (
    <section className="space-y-4">
      <ProjectBookingSplit project={project} />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Phases</h2>
          {project.canEdit && project.wonAt && (
            <Button asChild variant="outline" size="sm">
              <Link
                to={`/projects/new?${new URLSearchParams({ client: project.client.id, parent: project.id, name: `${project.name} – Phase ${nextPhase}` })}`}
              >
                <Plus className="size-4" /> Add Phase {nextPhase}
              </Link>
            </Button>
          )}
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <span>
              <span className="font-medium">Phase 1</span> · {project.name} <span className="text-text-muted">(this project)</span>
            </span>
            <span className="tabular-nums">{money(initial)}</span>
          </li>
          {project.upsellProjects.map((u) => (
            <li key={u.id} className="flex items-center gap-2 pr-2 hover:bg-accent">
              <Link
                to={`/projects/${u.id}`}
                className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span>
                    <span className="font-medium">Phase {u.phase}</span> · {u.name}{' '}
                    <span className="text-xs text-text-muted">{u.code}</span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.phaseKind === 'SCOPE' ? 'bg-primary/10 text-primary' : 'bg-warning/15'}`}
                  >
                    {u.phaseKind === 'SCOPE' ? 'Scope part' : 'Upsell'}
                  </span>
                  <StatusBadge status={u.status} />
                </span>
                <span className="text-right tabular-nums">
                  {money(u.contractValueMinor)}
                  <span className="block text-xs text-text-muted">{money(u.collectedMinor)} received</span>
                </span>
              </Link>
              {project.canEdit && (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link to={`/projects/${u.id}?tab=milestones&add=1`} aria-label={`Add milestone to Phase ${u.phase}`}>
                    <Plus className="size-4" /> Milestone
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
        {project.upsellProjects.length === 0 && (
          <p className="text-sm text-text-muted">When the client hires more work, add it as Phase 2 with its own booking and milestones.</p>
        )}
      </div>
    </section>
  );
}

function AddUpsellForm({ project }: { project: ProjectDetail }) {
  const add = useAddUpsell(project.id);
  const [amount, setAmount] = useState<number | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [key, setKey] = useState(0);

  return (
    <form
      key={key}
      className="grid gap-3 sm:grid-cols-[1fr_10rem_1fr_10rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (amount === null) return setAmountError(amountError ?? 'Enter an amount');
        if (!due) return toast.error('Choose the due date of its milestone');
        // D-038: the upsell is billed through a milestone of its own, marked Upsell.
        add.mutate(
          { amountMinor: amount, date, dueDate: due, ...(note ? { note } : {}) },
          {
            onSuccess: () => {
              toast.success('Upsell added, with its milestone');
              setKey((k) => k + 1);
              setAmount(null);
              setNote('');
              setDue('');
            },
            onError: (err) => toast.error(err.message),
          },
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="upsell-amount">Amount</Label>
        <MoneyInput
          id="upsell-amount"
          currency={project.currency}
          onValue={(v, err) => {
            setAmount(v);
            setAmountError(err);
          }}
        />
        {amountError && <p className="text-sm text-danger">{amountError}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="upsell-date">Date</Label>
        <Input id="upsell-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="upsell-note">Note</Label>
        <Input id="upsell-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was added" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="upsell-due">Milestone due date</Label>
        <Input id="upsell-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <Button type="submit" disabled={add.isPending}>
        Add upsell
      </Button>
    </form>
  );
}
