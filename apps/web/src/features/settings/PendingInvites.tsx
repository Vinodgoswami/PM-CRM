import { type LinkResponse, linkResponseSchema } from '@salescrm/schemas';
import { Button, Table, TBody, TD, TH, THead, TR, toast } from '@salescrm/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCw, X } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { ROLE_LABEL } from '../../lib/labels';
import { LinkPanel } from './LinkPanel';
import { useConfirm } from '../../components/ConfirmDialog';

const invitesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullable(),
      role: z.enum(['ADMIN', 'SALES', 'CEO']),
      expiresAt: z.string(),
      invitedBy: z.string(),
    }),
  ),
});
export const INVITES_KEY = ['users', 'invites'] as const;

/** Invites sent but not accepted yet: resend a fresh link (the old one stops working) or cancel. */
export function PendingInvites() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: INVITES_KEY, queryFn: () => apiFetch('/users/invites', { schema: invitesSchema }) });
  const [link, setLink] = useState<{ email: string; link: LinkResponse } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: INVITES_KEY });
  const resend = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/invites/${id}/resend`, { method: 'POST', schema: linkResponseSchema }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const confirm = useConfirm();
  const cancel = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/invites/${id}`, { method: 'DELETE', schema: z.unknown() }),
    onSuccess: () => {
      toast.success('Invite cancelled');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  if (!data || data.items.length === 0) return null;
  return (
    <section aria-label="Pending invites" className="space-y-3">
      <div>
        <h2 className="font-bold">Pending invites</h2>
        <p className="text-sm text-text-muted">
          Not signed up yet. Resend emails a new link (and shows it to copy); the old link stops working.
        </p>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Status</TH>
            <TH>Link expires</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {data.items.map((i) => (
            <TR key={i.id}>
              <TD className="font-medium">{i.name ?? '—'}</TD>
              <TD>{i.email}</TD>
              <TD>{ROLE_LABEL[i.role]}</TD>
              <TD>
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-primary">Invited</span>
              </TD>
              <TD>{formatDate(i.expiresAt.slice(0, 10))}</TD>
              <TD className="space-x-1 text-right whitespace-nowrap">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={resend.isPending}
                  onClick={() => resend.mutate(i.id, { onSuccess: (l) => setLink({ email: i.email, link: l }) })}
                >
                  <RotateCw className="size-4" /> Resend link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="bg-danger/10 text-danger hover:bg-danger/20 hover:text-danger"
                  disabled={cancel.isPending}
                  onClick={() =>
                    void confirm({
                      title: 'Delete invite?',
                      message: `Do you really want to delete the invite for ${i.email}? The link will stop working.`,
                    }).then((ok) => ok && cancel.mutate(i.id))
                  }
                >
                  <X className="size-4" /> Cancel invite
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {link && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">New invite link for {link.email}</p>
          <LinkPanel
            url={link.link.url}
            expiresAt={link.link.expiresAt}
            note="The previous link no longer works."
            emailed={link.link.emailed}
            to={link.email}
          />
          <Button size="sm" variant="outline" onClick={() => setLink(null)}>
            Done
          </Button>
        </div>
      )}
    </section>
  );
}
