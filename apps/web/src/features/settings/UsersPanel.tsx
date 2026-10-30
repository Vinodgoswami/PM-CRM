import { type LinkResponse, type Role, type UserListItem } from '@salescrm/schemas';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@salescrm/ui';
import { KeyRound, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '../auth/api';
import { useResetLink, useUpdateUser, useUsers } from './api';
import { InviteUserDialog } from './InviteUserDialog';
import { ROLE_LABEL } from '../../lib/labels';
import { manageableRoles } from '@salescrm/auth/permissions';
import { LinkPanel } from './LinkPanel';

export function UsersPanel() {
  const { data, isPending, isError } = useUsers();
  const { data: session } = useSession();
  const update = useUpdateUser();
  const reset = useResetLink();
  const [inviting, setInviting] = useState(false);
  const [resetFor, setResetFor] = useState<{ user: UserListItem; link: LinkResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mine = session ? manageableRoles(session.user.role) : [];
  const change = (u: UserListItem, patch: { role?: Role; active?: boolean }, question: string) => {
    if (!window.confirm(question)) return;
    setError(null);
    update.mutate({ id: u.id, ...patch }, { onSuccess: () => toast.success(`${u.name} updated`), onError: (e) => setError(e.message) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">Changing a role or deactivating someone signs them out immediately.</p>
        <Button onClick={() => setInviting(true)}>
          <UserPlus className="size-4" /> Invite user
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-accent px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : isError ? (
        <EmptyState title="Could not load users" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Last sign-in</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {data.items.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">
                  {u.name}
                  {u.id === session?.user.id && <span className="ml-1 text-text-muted">(you)</span>}
                </TD>
                <TD>{u.email}</TD>
                <TD>
                  {/* D-018: only accounts you may manage get controls; a CEO manages Project Managers only. */}
                  {!mine.includes(u.role) || mine.length < 2 ? (
                    ROLE_LABEL[u.role]
                  ) : (
                    <select
                      aria-label={`Role for ${u.name}`}
                      className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
                      value={u.role}
                      onChange={(e) =>
                        change(u, { role: e.target.value as Role }, `Change ${u.name}'s role to ${ROLE_LABEL[e.target.value as Role]}?`)
                      }
                    >
                      {mine.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  )}
                </TD>
                <TD>{u.active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}</TD>
                <TD>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}</TD>
                <TD className="space-x-1 text-right">
                  {mine.includes(u.role) && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          reset.mutate(u.id, { onSuccess: (link) => setResetFor({ user: u, link }), onError: (e) => setError(e.message) })
                        }
                      >
                        <KeyRound className="size-4" /> Reset link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => change(u, { active: !u.active }, `${u.active ? 'Deactivate' : 'Reactivate'} ${u.name}?`)}
                      >
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {inviting && <InviteUserDialog onClose={() => setInviting(false)} />}
      {resetFor && (
        <Dialog open onOpenChange={(o) => !o && setResetFor(null)}>
          <DialogContent>
            <DialogTitle>Password reset for {resetFor.user.name}</DialogTitle>
            <div className="mt-4">
              <LinkPanel url={resetFor.link.url} expiresAt={resetFor.link.expiresAt} note="Works once and signs them out everywhere." />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
