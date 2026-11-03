import { zodResolver } from '@hookform/resolvers/zod';
import { acceptInviteSchema } from '@salescrm/schemas';
import { Button, Skeleton } from '@salescrm/ui';
import { useQuery } from '@tanstack/react-query';
import { Lock, User } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/labels';
import { useAcceptInvite } from './api';
import { AuthCard } from './AuthCard';
import { Field } from './Field';

const formSchema = acceptInviteSchema.omit({ token: true });
const previewSchema = z.object({
  email: z.string(),
  name: z.string().nullable(),
  role: z.enum(['ADMIN', 'SALES', 'CEO']).nullable(),
  companyName: z.string(),
});

/** Opened from an invite link: says who is invited and as what, then asks only for a name and a new password. */
export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => apiFetch(`/auth/invite/${encodeURIComponent(token)}`, { schema: previewSchema }),
    retry: false,
  });
  const form = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema), defaultValues: { name: '', password: '' } });
  // One message at a time: editing or a failed field check drops the previous server error.
  const { reset: clearServerError } = accept;
  useEffect(() => {
    const sub = form.watch(() => clearServerError());
    return () => sub.unsubscribe();
  }, [form, clearServerError]);
  const { errors } = form.formState;
  useEffect(() => {
    if (invite.data?.name) form.setValue('name', invite.data.name);
  }, [invite.data, form]);

  const onSubmit = form.handleSubmit(
    (values) => accept.mutate({ ...values, token }, { onSuccess: () => navigate('/', { replace: true }) }),
    () => clearServerError(),
  );

  if (invite.isError) {
    return (
      <AuthCard title="Invite link not valid" greeting="Welcome!">
        <p className="text-sm text-text-muted">
          This invite link has expired or was already used. Ask the person who invited you to send a new link from Users.
        </p>
        <Link to="/login" className="text-sm font-semibold text-primary hover:underline">
          Already have an account? Sign in
        </Link>
      </AuthCard>
    );
  }
  const who = invite.data;
  return (
    <AuthCard
      title="Set up your account"
      greeting="Welcome!"
      description={
        who ? (
          <>
            You’re invited to {who.companyName || 'the team'} as {who.role ? ROLE_LABEL[who.role] : 'a user'}.
          </>
        ) : undefined
      }
    >
      {!who ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <p className="rounded-lg bg-accent px-3 py-2 text-sm">
            Your sign-in email: <strong>{who.email}</strong>
          </p>
          <Field label="Your name" icon={User} autoComplete="name" error={errors.name?.message} {...form.register('name')} />
          <Field
            label="Choose a password"
            icon={Lock}
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...form.register('password')}
          />
          <p className="text-xs text-text-muted">At least 10 characters. You will use this email and password to sign in.</p>
          {accept.error && (
            <p role="alert" className="text-sm text-danger">
              {accept.error.message}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11 w-full" disabled={accept.isPending}>
            Create account
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
