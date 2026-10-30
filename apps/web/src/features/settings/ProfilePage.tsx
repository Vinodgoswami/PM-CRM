import { changePasswordSchema, type SessionResponse } from '@salescrm/schemas';
import { Button } from '@salescrm/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/labels';
import { SESSION_KEY, useSession } from '../auth/api';
import { Avatar } from '../auth/Avatar';
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
    <section className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Your profile</h1>
      <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
        <PhotoPanel name={me.name} url={me.avatarUrl} />
        <div className="min-w-0 space-y-6">
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
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
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
        </div>
      </div>
    </section>
  );
}

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
const slotSchema = z.object({ key: z.string(), url: z.string(), headers: z.record(z.string(), z.string()) });

/** Left column: the photo, large, with change / remove. The top bar shows the same photo. */
function PhotoPanel({ name, url }: { name: string; url: string | null }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const refresh = (avatarUrl: string | null) => {
    qc.setQueryData<SessionResponse | null>(SESSION_KEY, (s) => (s ? { ...s, user: { ...s.user, avatarUrl } } : s));
    void qc.invalidateQueries({ queryKey: SESSION_KEY });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const slot = await apiFetch('/me/avatar/upload-url', {
        method: 'POST',
        body: { mimeType: file.type, sizeBytes: file.size },
        schema: slotSchema,
      });
      const put = await fetch(slot.url, { method: 'PUT', headers: slot.headers, body: file, credentials: 'same-origin' });
      if (!put.ok) throw new Error('The upload did not finish. Try again.');
      return apiFetch('/me/avatar', { method: 'POST', body: { key: slot.key }, schema: z.object({ avatarUrl: z.string().nullable() }) });
    },
    onSuccess: (r) => refresh(r.avatarUrl),
    onError: (e) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch('/me/avatar', { method: 'DELETE', schema: z.unknown() }),
    onSuccess: () => refresh(null),
    onError: (e) => setError(e.message),
  });

  return (
    <section aria-label="Profile photo" className="flex flex-col items-center gap-4 self-start rounded-xl bg-surface p-6 shadow-card">
      <Avatar name={name} url={url} className="size-48 text-5xl" />
      <p className="text-lg font-bold">{name}</p>
      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-contrast">
        <Camera className="size-4" aria-hidden /> {upload.isPending ? 'Uploading…' : 'Change photo'}
        <input
          type="file"
          accept={TYPES.join(',')}
          aria-label="Change photo"
          className="sr-only"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            setError(null);
            if (!file) return;
            if (!TYPES.includes(file.type) || file.size > MAX_BYTES) return setError('Use a JPEG, PNG or WebP image up to 2 MB.');
            upload.mutate(file);
          }}
        />
      </label>
      {url && (
        <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
          Remove photo
        </Button>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
