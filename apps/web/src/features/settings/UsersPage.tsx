import { PendingInvites } from './PendingInvites';
import { UsersPanel } from './UsersPanel';

/** Top-bar Users tab (D-022): everyone with an account, then invites not yet accepted. */
export function UsersPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Users</h1>
      <UsersPanel />
      <PendingInvites />
    </section>
  );
}
