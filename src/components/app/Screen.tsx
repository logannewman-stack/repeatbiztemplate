'use client';

/**
 * ============================================================================
 * SCREEN
 * ============================================================================
 * One page inside the app frame: a collapsing header, a large title, content.
 *
 * iOS shows a 34pt title in the content, then swaps to a small centred one in
 * the bar as it scrolls under. That handoff is the reason a native screen
 * feels oriented and a web page feels like a document — the name of the place
 * you are is prominent on arrival and out of the way afterwards.
 *
 * Driven by an IntersectionObserver on a sentinel rather than a scroll
 * listener, so nothing runs on the main thread during a flick.
 * ============================================================================
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { haptic } from './platform';
import { FooterSlotContext } from './AppFrame';

/**
 * Back goes to a route, or — inside a multi-step flow — to the previous step.
 * Both land in the same place in the bar, because to the person holding the
 * phone they are the same gesture.
 */
export type BackTarget =
  | { href: string; label?: string }
  | { onClick: () => void; label?: string };

export function Screen({
  title, subtitle, back, action, footer, children, largeTitle = true,
}: {
  title: string;
  subtitle?: string;
  back?: BackTarget;
  /** Trailing control in the bar — a phone link, an edit button. */
  action?: React.ReactNode;
  /** Pinned above the tab bar. The booking bar, a confirm button. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Off for dense screens where a 34pt title is wasted space. */
  largeTitle?: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState(!largeTitle);
  const sentinel = React.useRef<HTMLDivElement>(null);

  // The footer is rendered into the frame's slot, above the tab bar. See the
  // note in AppFrame for why it cannot simply be `fixed` from in here.
  const footerSlot = React.useContext(FooterSlotContext);

  React.useEffect(() => {
    if (!largeTitle) return;
    const node = sentinel.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      // Fires as the title passes under the bar, not when it clears the screen.
      { rootMargin: '-4px 0px 0px 0px', threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [largeTitle]);

  return (
    <>
      {/* Sticky rather than fixed: it is inside the scrolling element, so it
          pins against that element's box and never fights the viewport. */}
      <header
        className={cn(
          'app-chrome sticky top-0 z-30 transition-shadow duration-200',
          collapsed && 'hairline-b'
        )}
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="relative mx-auto flex h-[var(--header-height)] max-w-lg items-center gap-1 px-2">
          <div className="flex min-w-0 flex-1 items-center">
            {back && <BackControl back={back} />}
          </div>

          {/* Absolutely centred so a long back label cannot shove the title
              off-centre — exactly what native avoids. */}
          <span
            aria-hidden={!collapsed}
            className={cn(
              'pointer-events-none absolute left-1/2 max-w-[55%] -translate-x-1/2 truncate',
              'text-[17px] font-semibold transition-all duration-200',
              collapsed ? 'opacity-100' : 'translate-y-1 opacity-0'
            )}
          >
            {title}
          </span>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            {action}
          </div>
        </div>
      </header>

      {/* The landmark the root layout's skip link targets, and what a screen
          reader offers as "main content". */}
      <main id="main" className="mx-auto max-w-lg">
        {largeTitle && (
          <div className={cn('px-4 pt-1', subtitle ? 'pb-1' : 'pb-2')}>
            {/* iOS shrinks a large title that will not fit rather than
                clipping it. A long business name is the common case. */}
            <h1 className="text-[clamp(1.5rem,7.5vw,2.125rem)] font-bold leading-[1.1] tracking-[-0.022em]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-[15px] leading-snug text-[var(--color-muted)]">
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div ref={sentinel} aria-hidden className="h-px" />

        {children}

        {/* Breathing room under the last row, so nothing ends flush against
            the chrome below it. */}
        <div aria-hidden className="h-6" />
      </main>

      {/* No safe-area padding here: the tab bar sits below it and owns that. */}
      {footer && footerSlot && createPortal(
        <div className="app-chrome hairline-t px-4 py-3">
          <div className="mx-auto max-w-lg">{footer}</div>
        </div>,
        footerSlot
      )}
    </>
  );
}

const BACK_CLASSES =
  '-ml-1 flex items-center gap-0.5 rounded-lg py-1.5 pl-1 pr-2 text-[var(--color-brand)]';

function BackControl({ back }: { back: BackTarget }) {
  const inner = (
    <>
      <svg
        width="11" height="19" viewBox="0 0 11 19" aria-hidden
        fill="none" stroke="currentColor" strokeWidth={2.2}
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M9.5 1.5 1.9 9.5l7.6 8" />
      </svg>
      <span className="truncate text-[17px] leading-none">{back.label ?? 'Back'}</span>
    </>
  );

  if ('href' in back) {
    return (
      <Link
        href={back.href}
        onClick={() => haptic()}
        data-compact-target
        data-press
        className={BACK_CLASSES}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { haptic(); back.onClick(); }}
      data-compact-target
      data-press
      className={BACK_CLASSES}
    >
      {inner}
    </button>
  );
}
