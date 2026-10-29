import { zodResolver } from '@hookform/resolvers/zod';
import { acceptInviteSchema } from '@salescrm/schemas';
import { Button } from '@salescrm/ui';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { type z } from 'zod';
import { useAcceptInvite } from './api';
import { AuthCard } from './AuthCard';
import { Field } from './Field';

const formSchema = acceptInviteSchema.omit({ token: true });

export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const form = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema), defaultValues: { name: '', password: '' } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    accept.mutate({ ...values, token }, { onSuccess: () => navigate('/', { replace: true }) }),
  );

  return (
    <AuthCard title="Set up your account" description="Choose your display name and a password.">
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="Your name" autoComplete="name" error={errors.name?.message} {...form.register('name')} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        {accept.error && (
          <p role="alert" className="text-sm text-danger">
            {accept.error.message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={accept.isPending}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
