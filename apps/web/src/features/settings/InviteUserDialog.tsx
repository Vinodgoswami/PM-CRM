import { inviteUserSchema, type LinkResponse } from '@salescrm/schemas';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label } from '@salescrm/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useInviteUser } from './api';
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
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkResponse | null>(null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Invite user</DialogTitle>
        <DialogDescription>They set their own password from the link. Nothing is emailed; share the link yourself.</DialogDescription>
        {link ? (
          <div className="mt-4 space-y-4">
            <LinkPanel url={link.url} expiresAt={link.expiresAt} note="Works once." emailed={link.emailed} to={email} />
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            noValidate
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = inviteUserSchema.safeParse({ name, email, role });
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
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Name</Label>
              <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
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
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={invite.isPending}>
                Create invite link
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
