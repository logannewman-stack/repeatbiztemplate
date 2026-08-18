'use client';

import * as React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { brand } from '@/config/brand';
import { Button, Card, Input, Field, Alert } from '@/components/ui';

/**
 * Magic-link sign-in.
 *
 * No passwords by design: a salon client books every six weeks and will not
 * remember one, and a forgotten-password flow is a booking they didn't make.
 */
export default function LoginPage() {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) throw authError;
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.');
      setState('error');
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-center text-[var(--color-brand)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.assets.logoMark} alt={brand.name} className="mx-auto size-12" />
      </Link>

      <Card className="p-6">
        {state === 'sent' ? (
          <div className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-xl text-[var(--color-success)]">
              ✓
            </div>
            <h1 className="mt-4 text-xl font-semibold">Check your email</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              We sent a sign-in link to <strong>{email}</strong>. It expires in an hour.
            </p>
            <button
              onClick={() => setState('idle')}
              className="mt-4 text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold">Sign in</h1>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                We&apos;ll email you a link — no password needed.
              </p>
            </div>

            {error && <Alert tone="danger">{error}</Alert>}

            <Field label="Email" required htmlFor="email">
              <Input
                id="email" type="email" required autoComplete="email"
                inputMode="email" autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            <Button type="submit" fullWidth size="lg" loading={state === 'sending'}>
              Email me a link
            </Button>

            <p className="text-center text-sm text-[var(--color-muted)]">
              Booking for the first time?{' '}
              <Link href="/book" className="underline">Book without an account</Link>
            </p>
          </form>
        )}
      </Card>
    </main>
  );
}
