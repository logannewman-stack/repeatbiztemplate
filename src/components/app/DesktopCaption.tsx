'use client';

/**
 * ============================================================================
 * DESKTOP CAPTION
 * ============================================================================
 * Sits under the phone on a laptop, and nowhere else — the media query in
 * globals.css is what reveals it.
 *
 * Two jobs, both for the person looking at this on a big screen:
 *
 *   1. say plainly that this is the phone app, so nobody mistakes a 390px
 *      column for a broken website
 *   2. hand them the address to open it on their own phone, which is where
 *      it has to end up before they can install it
 *
 * The host is read at runtime rather than baked in, because the same build
 * serves a preview URL, a custom domain and localhost, and a wrong address
 * here is worse than none.
 * ============================================================================
 */

import * as React from 'react';

export function DesktopCaption({ businessName }: { businessName: string }) {
  const [host, setHost] = React.useState<string | null>(null);

  React.useEffect(() => {
    setHost(window.location.host);
  }, []);

  return (
    <div
      className="desktop-caption pointer-events-none fixed inset-x-0 bottom-7 z-10 text-center"
    >
      <p className="font-[family-name:var(--font-heading)] text-[15px] font-semibold tracking-[-0.01em]">
        {businessName}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-[var(--color-muted)]">
        Designed for your phone.
        {host && (
          <>
            {' '}Open{' '}
            <span className="font-medium text-[var(--color-fg)]">{host}</span>
            {' '}there to add it to your home screen.
          </>
        )}
      </p>
    </div>
  );
}
