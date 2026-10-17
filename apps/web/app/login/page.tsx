'use client';

import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, friendlyErrorMessage } from '../../lib/api';
import { useToast } from '../components/Toast';

interface LoginForm {
  email: string;
  password: string;
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 outline-none placeholder:text-faint focus:border-ink/50';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { loading: loadingToast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { email: '', password: '' } });

  async function onSubmit(values: LoginForm) {
    setServerError(null);
    const t = loadingToast('Signing in…', 'Checking your credentials.');
    try {
      const { status, data } = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      if (status === 200) {
        t.success('Welcome back', 'Signed in successfully.');
        const redirect = searchParams.get('redirect');
        router.push(redirect && redirect.startsWith('/') ? redirect : '/events');
        router.refresh();
        return;
      }
      const msg = friendlyErrorMessage(status, data, 'Login failed. Check your credentials.');
      setServerError(msg);
      t.error('Login failed', msg);
    } catch {
      const msg = 'Could not reach the API. Is the backend running?';
      setServerError(msg);
      t.error('Network error', msg);
    }
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy p-10 text-white md:flex">
        <Link href="/events" className="flex items-center gap-2.5" aria-label="EventBook home">
          <Image
            src="/logo.png"
            alt="EventBook logo"
            width={32}
            height={32}
            className="rounded-md"
          />
          <span className="font-display text-lg font-bold tracking-tight">EventBook</span>
        </Link>
        <div>
          <p className="font-display text-5xl font-bold leading-[1.02] tracking-tight">
            Your seat
            <br />
            is waiting.
          </p>
          <p className="mt-4 max-w-sm leading-relaxed text-white/70">
            Workshops, meetups, and live sessions with live seat counts. Sign in to book in one tap.
          </p>
          <div
            className="ticket-edge mt-8 !bg-[linear-gradient(to_right,rgba(255,255,255,0.3)_55%,transparent_45%)]"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm text-white/60">
            Free account · Cancel anytime · No overbooking, ever
          </p>
        </div>
        <p className="text-xs text-white/50">© {new Date().getFullYear()} EventBook</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <Link href="/events" className="font-display text-lg font-bold tracking-tight md:hidden">
            EventBook
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your EventBook account.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email', {
                  required: 'Email is required.',
                  pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Enter a valid email.' },
                })}
                className={inputClass}
              />
              {errors.email && <p className="mt-1 text-sm text-danger">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <span className="relative mt-1.5 block">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password', { required: 'Password is required.' })}
                  className={`${inputClass} mt-0 pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 min-h-[36px] min-w-[36px] -translate-y-1/2 rounded-lg p-1.5 text-faint hover:text-ink"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
              {errors.password && (
                <p className="mt-1 text-sm text-danger">{errors.password.message}</p>
              )}
            </div>
            {serverError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-line bg-danger-bg/50 px-3 py-2.5 text-sm text-danger"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" /> {serverError}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary px-3 py-2.5 font-semibold text-ink transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            No account yet?{' '}
            <Link href="/register" className="font-semibold text-primary-deep hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

// useSearchParams() must sit inside a Suspense boundary or the production
// build bails while prerendering the page.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center">
          <Loader2 size={24} className="animate-spin text-faint" aria-label="Loading" />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
