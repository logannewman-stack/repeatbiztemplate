/**
 * Served by the service worker when a navigation fails with no network.
 *
 * Kept outside the app group and free of data access on purpose: it has to
 * render from cache alone, so it cannot depend on anything the network would
 * have to supply.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="app-frame items-center justify-center px-8 text-center">
      <div
        className="flex flex-col items-center"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <span className="mb-5 flex size-14 items-center justify-center rounded-[1rem] bg-[var(--color-surface-2)] text-[var(--color-muted)]">
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden
            fill="none" stroke="currentColor" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3.2-2.1M19 12.9a10 10 0 0 0-6.5-2.8M1.8 9.4a15 15 0 0 1 4.4-2.6M22.2 9.4a15 15 0 0 0-9.6-3.3" />
            <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>

        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">
          You&rsquo;re offline
        </h1>
        <p className="mt-2 max-w-xs text-[15px] leading-snug text-[var(--color-muted)]">
          This screen needs a connection. Your existing appointments are
          unaffected — reconnect and it will pick up where it left off.
        </p>

        <a
          href="/"
          className="mt-6 rounded-[0.7rem] bg-[var(--color-brand)] px-5 py-3 text-[15px] font-semibold text-[var(--color-brand-fg)]"
          data-press
        >
          Try again
        </a>
      </div>
    </main>
  );
}
