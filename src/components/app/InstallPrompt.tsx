'use client';

/**
 * ============================================================================
 * INSTALL PROMPT
 * ============================================================================
 * Getting the icon onto the home screen is the whole point — an app the client
 * has to find in a browser is a website with a tab bar.
 *
 * The two platforms need entirely different handling:
 *
 *   Android/Chrome  fires `beforeinstallprompt`, which can be captured and
 *                   replayed later from a real button.
 *   iOS Safari      has never fired it and never will. The only route is
 *                   Share -> Add to Home Screen, so all we can do is say so,
 *                   pointing at a control we cannot draw attention to.
 *
 * Shown once, deferred for a month if dismissed, never when already installed
 * — and never during a flow. It is a fixed overlay above the tab bar, so on
 * the booking screen it lands squarely on the time slots. Interrupting someone
 * mid-booking to ask them to install the app trades the conversion you already
 * had for one you might get, at the step where abandonment is highest.
 * ============================================================================
 */

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { usePlatform, haptic } from './platform';
import { cn } from '@/lib/utils';

const SNOOZE_KEY = 'install-prompt-snoozed-until';
const SNOOZE_DAYS = 30;

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Screens where interrupting is acceptable: the person is browsing, not
 * part-way through giving us money. An allow-list rather than a block-list, so
 * a new checkout route is quiet by default instead of loud by accident.
 */
const CALM_ROUTES = ['/', '/account', '/memberships'];

export function InstallPrompt({ appName }: { appName: string }) {
  const { isStandalone, isIOS, isPending } = usePlatform();
  const pathname = usePathname();
  const calm = CALM_ROUTES.includes(pathname);
  const [event, setEvent] = React.useState<InstallEvent | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Without this Chrome shows its own mini-infobar instead.
      e.preventDefault();
      setEvent(e as InstallEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  React.useEffect(() => {
    if (isPending || isStandalone || !calm) return;

    let snoozedUntil = 0;
    try {
      snoozedUntil = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
    } catch {
      // Private mode or blocked storage. Showing it is the safe default.
    }
    if (Date.now() < snoozedUntil) return;

    // iOS gets the instructions; everyone else waits for a real install event.
    if (isIOS || event) {
      // Let the screen settle before interrupting.
      const timer = window.setTimeout(() => setVisible(true), 2200);
      return () => window.clearTimeout(timer);
    }
  }, [isPending, isStandalone, isIOS, event, calm]);

  const dismiss = React.useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(
        SNOOZE_KEY,
        String(Date.now() + SNOOZE_DAYS * 86_400_000)
      );
    } catch {
      // Nothing to do — it will simply ask again next time.
    }
  }, []);

  if (!visible || isStandalone || !calm) return null;

  const install = async () => {
    haptic();
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
    dismiss();
  };

  return (
    <div
      className="animate-fade-in fixed inset-x-0 bottom-0 z-50 px-3"
      style={{ paddingBottom: 'calc(var(--chrome-bottom) + 0.75rem)' }}
      role="dialog"
      aria-label={`Install ${appName}`}
    >
      <div className="mx-auto max-w-lg rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[0.6rem] bg-[var(--color-brand)] text-[var(--color-brand-fg)]">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden
              fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0 4.2-4.2M12 15l-4.2-4.2M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Add {appName} to your home screen</p>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-muted)]">
              {isIOS ? (
                <>
                  Tap the Share button, then <strong>Add to Home Screen</strong>.
                  It opens full screen, like an app.
                </>
              ) : (
                <>Opens full screen and remembers you — no app store.</>
              )}
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={dismiss}
            data-press
            className={cn(
              'flex-1 rounded-[0.6rem] bg-[var(--color-surface-2)] px-3 py-2.5',
              'text-[15px] font-medium'
            )}
          >
            Not now
          </button>

          {!isIOS && event && (
            <button
              type="button"
              onClick={install}
              data-press
              className="flex-1 rounded-[0.6rem] bg-[var(--color-brand)] px-3 py-2.5 text-[15px] font-semibold text-[var(--color-brand-fg)]"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
