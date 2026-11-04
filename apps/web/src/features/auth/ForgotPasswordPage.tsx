import { zodResolver } from '@hookform/resolvers/zod';
import { type ForgotPasswordInput, forgotPasswordSchema } from '@salescrm/schemas';
import { Button } from '@salescrm/ui';
import { Mail, MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { useForgotPassword } from './api';
import { AuthCard } from './AuthCard';
import { Field } from './Field';

/** D-034: anyone who forgot their password gets a one-time reset link by email. */
export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const { errors } = form.formState;

  if (forgot.isSuccess) {
    return (
      <AuthCard title="Check your email">
        <div className="space-y-4">
          <p role="status" className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
            <MailCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            {forgot.data.message}
          </p>
          <p className="text-sm text-text-muted">No email after a few minutes? Check spam, or ask your admin for a reset link.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot password?" description="Enter your email and we will send you a link to choose a new password.">
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => forgot.mutate(v))} noValidate>
        <Field
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="username"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...form.register('email')}
        />
        {forgot.error && (
          <p role="alert" className="text-sm text-danger">
            {forgot.error.message}
          </p>
        )}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={forgot.isPending}>
          {forgot.isPending ? 'Sending…' : 'Send reset link'}
        </Button>
        <p className="text-center text-sm">
          <Link to="/login" className="text-text-muted hover:text-text hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
