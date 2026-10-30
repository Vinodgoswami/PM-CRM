import { can } from '@salescrm/auth/permissions';
import { type PaymentDto, type ProjectDetail } from '@salescrm/schemas';
import { Button, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { Pencil, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '../../../lib/dates';
import { formatApiMoney } from '../../../lib/money';
import { useSession } from '../../auth/api';
import { usePayments } from '../../payments/api';
import { EditPaymentDialog } from '../../payments/EditPaymentDialog';
import { BaseAmount } from '../../payments/BaseAmount';
import { ReverseDialog } from '../../payments/ReverseDialog';

export function PaymentsTab({ project }: { project: ProjectDetail }) {
  const { data: session } = useSession();
  const { data, isPending, isError } = usePayments(new URLSearchParams({ projectId: project.id, pageSize: '100' }).toString());
  const canEdit = !!session && can(session.user, 'payments.editMeta', { ownerId: project.owner.id });
  const canReverse = !!session && can(session.user, 'payments.reverse');
  const [editing, setEditing] = useState<PaymentDto | null>(null);
  const [reversing, setReversing] = useState<PaymentDto | null>(null);

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (isError) return <EmptyState title="Could not load payments" />;
  if (data.items.length === 0) return <EmptyState title="No payments yet" description="Use “Mark as paid” on the Milestones tab." />;
  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Milestone</TH>
            <TH>Invoice ID</TH>
            <TH className="text-right">Amount</TH>
            <TH>Recorded by</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {data.items.map((p) => {
            const reversal = p.reversesPaymentId !== null;
            return (
              <TR key={p.id} className={reversal ? 'text-danger' : undefined}>
                <TD>{formatDate(p.paymentDate)}</TD>
                <TD>
                  {p.milestoneLabel}
                  {reversal && <span className="ml-2 text-xs">Reversal{p.note ? ` · ${p.note}` : ''}</span>}
                  {p.reversedById && <span className="ml-2 text-xs text-text-muted">(reversed)</span>}
                </TD>
                <TD>{p.invoiceId ?? '—'}</TD>
                <TD className="text-right font-medium tabular-nums">
                  {formatApiMoney(p.amountMinor, p.project.currency)}
                  <BaseAmount payment={p} />
                </TD>
                <TD>{p.createdBy.name}</TD>
                <TD className="space-x-1 text-right">
                  {canEdit && !reversal && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit payment ${p.invoiceId ?? p.milestoneLabel}`}
                      onClick={() => setEditing(p)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {canReverse && !reversal && !p.reversedById && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Reverse payment ${p.invoiceId ?? p.milestoneLabel}`}
                      onClick={() => setReversing(p)}
                    >
                      <Undo2 className="size-4" /> Reverse
                    </Button>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {editing && <EditPaymentDialog payment={editing} onClose={() => setEditing(null)} />}
      {reversing && <ReverseDialog payment={reversing} onClose={() => setReversing(null)} />}
    </>
  );
}
