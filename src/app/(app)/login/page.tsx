'use client';

import * as React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Field, Alert } from '@/components/ui';
import { Screen, haptic } from '@/components/app';

/**
 * Magic-link sign-in.
 *
 * No passwords by design: a salon client books every six weeks and will not
 * remember one, and a forgotten-password flow is a booking they didn't make.
 *
 * Laid out as a native form rather than a centred card. A boxed form floating
 * in the middle of a phone screen is a desktop pattern that survived the
 * shrink; on iOS the field belongs directly on the grouped background with the
 * action pinned beneath it.
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
      haptic([8, 40, 8]);
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.');
      setState('error');
    }
  }

  // --- Sent -----------------------------------------------------------------
  if (state === 'sent') {
    return (
      <Screen title="Check your email" largeTitle={false}>
        <div className="flex flex-col items-center px-8 pt-14 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)]">
            <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden
              fill="none" stroke="currentColor" strokeWidth={2.2}
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 12.5 9.5 17.5 19.5 7" />
            </svg>
          </span>

          <h2 className="mt-5 text-[24px] font-semibold leading-tight">
            Check your email
          </h2>
          <p className="mt-2 max-w-xs text-[15px] leading-snug text-[var(--color-muted)]">
            We sent a sign-in link to{' '}
            <strong className="text-[var(--color-fg)]">{email}</strong>. It
            expires in an hour.
          </p>

          <button
            type="button"
            onClick={() => setState('idle')}
            data-press
            className="mt-7 rounded-[0.7rem] bg-[var(--color-surface-2)] px-4 py-2.5 text-[15px] font-medium"
          >
            Use a different email
          </button>
        </div>
      </Screen>
    );
  }

  // --- Form -----------------------------------------------------------------
  return (
    <Screen
      title="Sign in"
      subtitle="We&rsquo;ll email you a link — no password to remember."
      footer={
        <Button
          type="submit"
          form="signin"
          fullWidth
          size="lg"
          loading={state === 'sending'}
        >
          Email me a link
        </Button>
      }
    >
      <form id="signin" onSubmit={submit} className="px-4 pt-2">
        {error && (
          <div className="pb-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <div className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-md)]">
          <Field label="Email" required htmlFor="email">
            <Input
              id="email" type="email" required autoComplete="email"
              inputMode="email" autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
        </div>

        <p className="px-1 pt-3 text-[13px] leading-snug text-[var(--color-muted)]">
          Booking for the first time?{' '}
          <Link href="/book" className="font-medium text-[var(--color-brand)]">
            Book without an account
          </Link>
          {' '}— you can create one from the confirmation afterwards.
        </p>
      </form>
    </Screen>
  );
}
