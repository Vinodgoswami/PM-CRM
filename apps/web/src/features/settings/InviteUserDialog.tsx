import { inviteUserSchema, type LinkResponse } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label } from '@salescrm/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useInviteUser, useUsers } from './api';
import { manageableRoles } from '@salescrm/auth/permissions';
import { ROLE_LABEL } from '../../lib/labels';
import { useSession } from '../auth/api';
import { OptionSelect } from '../../components/OptionSelect';
import { LinkPanel } from './LinkPanel';

export function InviteUserDialog({ onClose }: { onClose: () => void }) {
  const invite = useInviteUser();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const { data: session } = useSession();
  // D-018: Admin adds anyone; the CEO adds Project Managers only.
  const roles = (['SALES', 'CEO', 'ADMIN'] as const).filter((r) => session && manageableRoles(session.user.role).includes(r));
  const [role, setRole] = useState<'SALES' | 'CEO' | 'ADMIN'>('SALES');
  // D-024: the Admin chooses which CEO a new project manager reports to; a CEO's invites join their own team.
  const choosesTeam = session?.user.role === 'ADMIN' && role === 'SALES';
  const ceos = (useUsers().data?.items ?? []).filter((u) => u.role === 'CEO' && u.active);
  const [managerId, setManagerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkResponse | null>(null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Invite user</DialogTitle>
        <DialogDescription>
          {link
            ? 'They choose their own password from this link.'
            : 'We email them a link to set their own password. You also get the link, to share yourself if needed.'}
        </DialogDescription>
        {link ? (
          <div className="mt-4 space-y-4">
            <LinkPanel url={link.url} expiresAt={link.expiresAt} note="Works once." emailed={link.emailed} to={email} />
            <div className="flex justify-end border-t border-border pt-4">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            noValidate
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = inviteUserSchema.safeParse({ name, email, role, ...(choosesTeam && managerId ? { managerId } : {}) });
              if (!parsed.success) return setError(parsed.error.issues[0]!.message);
              setError(null);
              invite.mutate(parsed.data, {
                onSuccess: (res) => {
                  setLink(res);
                  void qc.invalidateQueries({ queryKey: ['users'] });
                },
                onError: (err) => setError(err.message),
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">Name</Label>
                <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email</Label>
                <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className={`grid gap-4 ${choosesTeam ? 'sm:grid-cols-2' : ''}`}>
              <div className="space-y-1.5">
                <Label htmlFor="inv-role">Role</Label>
                <OptionSelect
                  id="inv-role"
                  className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  value={role}
                  onValueChange={(v) => setRole(v as typeof role)}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </OptionSelect>
              </div>
              {choosesTeam && (
                <div className="space-y-1.5">
                  <Label htmlFor="inv-manager">Reports to</Label>
                  <OptionSelect
                    id="inv-manager"
                    className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                    value={managerId}
                    onValueChange={setManagerId}
                  >
                    <option value="">No one yet (assign later)</option>
                    {ceos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </OptionSelect>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
