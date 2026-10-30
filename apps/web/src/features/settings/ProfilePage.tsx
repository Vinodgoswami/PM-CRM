import { changePasswordSchema } from '@salescrm/schemas';
import { Button } from '@salescrm/ui';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/labels';
import { useSession } from '../auth/api';
import { Field } from '../auth/Field';

/** Your own account: who you are, and changing your password (other devices are signed out). */
export function ProfilePage() {
  const { data: session } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (body: z.infer<typeof changePasswordSchema>) =>
      apiFetch('/auth/password/change', { method: 'POST', body, schema: z.unknown() }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setAgain('');
    },
    onError: (e) => setError(e.message),
  });
  if (!session) return null;
  const me = session.user;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    change.reset();
    if (next !== again) return setError('The two new passwords do not match.');
    const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the passwords.');
    change.mutate(parsed.data);
  };

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Your profile</h1>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-3 rounded-xl bg-surface p-5 text-sm shadow-card">
        <dt className="text-text-muted">Name</dt>
        <dd className="font-medium">{me.name}</dd>
        <dt className="text-text-muted">Email</dt>
        <dd>{me.email}</dd>
        <dt className="text-text-muted">Role</dt>
        <dd>{ROLE_LABEL[me.role]}</dd>
      </dl>
      <form onSubmit={submit} className="space-y-4 rounded-xl bg-surface p-5 shadow-card" noValidate>
        <h2 className="font-bold">Change password</h2>
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Field
          label="Repeat new password"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {change.isSuccess && (
          <p role="status" className="rounded-md bg-accent px-3 py-2 text-sm text-primary">
            Password changed. Other devices were signed out.
          </p>
        )}
        <Button type="submit" disabled={change.isPending}>
          <KeyRound className="size-4" /> Change password
        </Button>
      </form>
    </section>
  );
}
