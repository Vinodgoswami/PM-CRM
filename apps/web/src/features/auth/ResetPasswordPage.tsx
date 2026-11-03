import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@salescrm/schemas';
import { Button } from '@salescrm/ui';
import { Lock } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { type z } from 'zod';
import { useResetPassword } from './api';
import { AuthCard } from './AuthCard';
import { Field } from './Field';

const formSchema = resetPasswordSchema.omit({ token: true });

export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const reset = useResetPassword();
  const form = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema), defaultValues: { password: '' } });
  // One message at a time: editing or a failed field check drops the previous server error.
  const { reset: clearServerError } = reset;
  useEffect(() => {
    const sub = form.watch(() => clearServerError());
    return () => sub.unsubscribe();
  }, [form, clearServerError]);
  const { errors } = form.formState;

  if (reset.isSuccess) {
    return (
      <AuthCard title="Password updated" description="Sign in with your new password.">
        <Button asChild className="w-full">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(
          (v) => reset.mutate({ ...v, token }),
          () => clearServerError(),
        )}
        noValidate
      >
        <Field
          label="New password"
          icon={Lock}
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        {reset.error && (
          <p role="alert" className="text-sm text-danger">
            {reset.error.message}
          </p>
        )}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={reset.isPending}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
