'use client';

/**
 * ============================================================================
 * NOTIFICATION SETTING
 * ============================================================================
 * The control that turns push on, and the explanation for why it sometimes
 * cannot be turned on yet.
 *
 * The `needs-install` state is the one that matters. On iPhone, notifications
 * are unavailable until the app is on the Home Screen — and a button that
 * appears to work but silently does nothing burns the single permission
 * request the browser will ever grant. So on iOS in a tab this shows the
 * install instructions instead of a switch.
 *
 * Enabling happens inside the click handler, not after an await chain that
 * loses the user gesture the browser requires.
 * ============================================================================
 */

import * as React from 'react';
import { usePush } from './push';
import { haptic } from './platform';
import { cn } from '@/lib/utils';

export function NotificationSetting({
  vapidPublicKey,
  visitNoun = 'appointment',
}: {
  vapidPublicKey: string | null;
  visitNoun?: string;
}) {
  const { state, busy, error, enable, disable } = usePush(vapidPublicKey);

  // Nothing to configure and nothing useful to say about it.
  if (state === 'unsupported') return null;

  return (
    <section className="px-4 py-2">
      <h3 className="px-1 pb-1.5 font-[family-name:var(--font-body)] text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">
        Notifications
      </h3>

      <div className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)]">
        <div className="flex min-h-[var(--tap-min)] items-center gap-3 px-4 py-3">
          <span className="flex size-7 shrink-0 items-center justify-center text-[var(--color-brand)]">
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden
              fill="none" stroke="currentColor" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8.6a6 6 0 1 0-12 0c0 6-2.2 7.4-2.2 7.4h16.4S18 14.6 18 8.6" />
              <path d="M13.7 20a2 2 0 0 1-3.4 0" />
            </svg>
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[17px] leading-tight">
              {visitNoun.charAt(0).toUpperCase() + visitNoun.slice(1)} reminders
            </span>
            <span className="mt-0.5 block text-[13px] text-[var(--color-muted)]">
              {state === 'granted'
                ? 'On for this device'
                : state === 'denied'
                  ? 'Blocked in browser settings'
                  : state === 'needs-install'
                    ? 'Available once installed'
                    : 'Off'}
            </span>
          </span>

          {(state === 'prompt' || state === 'granted') && (
            <button
              type="button"
              disabled={busy}
              data-compact-target
              data-press
              onClick={() => {
                haptic();
                if (state === 'granted') void disable();
                else void enable();
              }}
              className={cn(
                'shrink-0 rounded-[0.6rem] px-3.5 py-2 text-[15px] font-medium transition-opacity',
                busy && 'opacity-50',
                state === 'granted'
                  ? 'bg-[var(--color-surface-2)]'
                  : 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]'
              )}
            >
              {busy ? '…' : state === 'granted' ? 'Turn off' : 'Turn on'}
            </button>
          )}
        </div>

        {state === 'needs-install' && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <p className="text-[13px] leading-snug text-[var(--color-muted)]">
              iPhone only delivers notifications to apps on the Home Screen.
              Tap the Share button below, choose{' '}
              <strong className="text-[var(--color-fg)]">Add to Home Screen</strong>,
              then open it from the new icon and come back here.
            </p>
          </div>
        )}

        {state === 'denied' && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <p className="text-[13px] leading-snug text-[var(--color-muted)]">
              Notifications are blocked for this site. The browser will not ask
              again — turn them back on in your browser or system settings for
              this app.
            </p>
          </div>
        )}

        {error && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <p className="text-[13px] leading-snug text-[var(--color-danger)]">
              {error}
            </p>
          </div>
        )}
      </div>

      <p className="px-1 pt-1.5 text-[13px] leading-snug text-[var(--color-muted)]">
        {state === 'granted'
          ? `We'll remind you before each ${visitNoun} and let you know when an earlier slot opens up. No offers.`
          : `Get a reminder before each ${visitNoun}, and first refusal on cancellations.`}
      </p>
    </section>
  );
}
