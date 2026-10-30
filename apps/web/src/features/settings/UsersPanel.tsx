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
import { Link } from 'react-router';
import { OptionSelect } from '../../components/OptionSelect';
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
  // D-024: the Admin assigns project managers to a CEO; a CEO only ever sees their own team, so no column there.
  const assignsTeams = session?.user.role === 'ADMIN';
  const ceos = (data?.items ?? []).filter((x) => x.role === 'CEO' && x.active);
  const change = (u: UserListItem, patch: { role?: Role; active?: boolean; managerId?: string | null }, question: string) => {
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
              {assignsTeams && <TH>Reports to</TH>}
              <TH>Status</TH>
              <TH>Last sign-in</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {data.items.map((u) => {
              // Your own account is managed from your profile, never from this list.
              const self = u.id === session?.user.id;
              const manage = !self && mine.includes(u.role);
              return (
                <TR key={u.id}>
                  <TD className="font-medium">
                    {u.name}
                    {self && <span className="ml-1 text-text-muted">(you)</span>}
                  </TD>
                  <TD>{u.email}</TD>
                  <TD>
                    {/* D-018: only accounts you may manage get controls; a CEO manages Project Managers only. */}
                    {!manage || mine.length < 2 ? (
                      ROLE_LABEL[u.role]
                    ) : (
                      <OptionSelect
                        aria-label={`Role for ${u.name}`}
                        className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
                        value={u.role}
                        onValueChange={(v) => change(u, { role: v as Role }, `Change ${u.name}'s role to ${ROLE_LABEL[v as Role]}?`)}
                      >
                        {mine.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </OptionSelect>
                    )}
                  </TD>
                  {assignsTeams && (
                    <TD>
                      {u.role === 'SALES' ? (
                        <OptionSelect
                          aria-label={`Reports to for ${u.name}`}
                          className="h-8 min-w-36 rounded-md"
                          value={u.manager?.id ?? ''}
                          onValueChange={(v) =>
                            change(
                              u,
                              { managerId: v || null },
                              v
                                ? `${u.name} will report to ${ceos.find((c) => c.id === v)?.name ?? 'this CEO'}. Continue?`
                                : `Remove ${u.name} from their team?`,
                            )
                          }
                        >
                          <option value="">No one yet</option>
                          {ceos.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </OptionSelect>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </TD>
                  )}
                  <TD>{u.active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}</TD>
                  <TD>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}</TD>
                  <TD className="space-x-1 text-right">
                    {self && (
                      <Link to="/profile" className="text-sm font-medium text-primary hover:underline">
                        Your profile
                      </Link>
                    )}
                    {manage && (
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
                          className={u.active ? 'bg-danger/10 text-danger hover:bg-danger/20 hover:text-danger' : undefined}
                          onClick={() => change(u, { active: !u.active }, `${u.active ? 'Deactivate' : 'Reactivate'} ${u.name}?`)}
                        >
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      {inviting && <InviteUserDialog onClose={() => setInviting(false)} />}
      {resetFor && (
        <Dialog open onOpenChange={(o) => !o && setResetFor(null)}>
          <DialogContent>
            <DialogTitle>Password reset for {resetFor.user.name}</DialogTitle>
            <div className="mt-4">
              <LinkPanel
                url={resetFor.link.url}
                expiresAt={resetFor.link.expiresAt}
                note="Works once and signs them out everywhere."
                emailed={resetFor.link.emailed}
                to={resetFor.user.email}
                what="Reset link"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
