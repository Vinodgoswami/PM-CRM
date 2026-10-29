import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@salescrm/schemas';
import { Button } from '@salescrm/ui';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { useLogin } from './api';
import { AuthCard } from './AuthCard';
import { Field } from './Field';
import { safeNext } from './safe-next';

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useLogin();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(safeNext(params.get('next')), { replace: true }) }),
  );

  return (
    <AuthCard title="Sign in" description="Use the email your admin invited.">
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="Email" type="email" autoComplete="username" error={errors.email?.message} {...form.register('email')} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        {login.error && (
          <p role="alert" className="text-sm text-danger">
            {login.error.message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-sm text-text-muted">Forgot your password? Ask your admin for a reset link.</p>
      </form>
    </AuthCard>
  );
}
