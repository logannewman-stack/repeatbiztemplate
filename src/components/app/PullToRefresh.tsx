'use client';

/**
 * ============================================================================
 * PULL TO REFRESH
 * ============================================================================
 * The gesture every native app has and almost no web app does. Its absence is
 * felt rather than noticed: a person at the top of a list pulls down out of
 * habit, nothing happens, and the app quietly reads as a web page.
 *
 * Deliberately narrow about when it engages, because the failure mode is
 * hijacking an ordinary scroll:
 *
 *   - only from a genuine scrollTop of 0
 *   - only on a downward drag that starts there
 *   - only for touch; a trackpad has no equivalent gesture
 *
 * Resistance is applied so the sheet follows the finger at a decreasing rate,
 * which is what makes the pull feel attached to something rather than free.
 * ============================================================================
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { haptic } from './platform';

/** Pull past this many px and release to trigger. */
const THRESHOLD = 68;
/** Hard stop, so a long drag cannot push the header off the screen. */
const MAX_PULL = 110;

export function PullToRefresh({
  scrollRef,
  children,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const start = React.useRef<number | null>(null);
  const armed = React.useRef(false);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const onTouchStart = (e: TouchEvent) => {
      // Only arm at the very top. Anywhere else this is an ordinary scroll and
      // must be left alone.
      armed.current = node.scrollTop <= 0 && e.touches.length === 1;
      start.current = armed.current ? e.touches[0].clientY : null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armed.current || start.current === null || refreshing) return;

      const delta = e.touches[0].clientY - start.current;

      if (delta <= 0) {
        // They changed their mind and scrolled up. Hand the gesture back.
        armed.current = false;
        setPull(0);
        return;
      }

      // Square-root resistance: generous at first, stiff near the limit.
      const resisted = Math.min(MAX_PULL, Math.sqrt(delta) * 7);

      if (resisted > THRESHOLD && pull <= THRESHOLD) haptic(6);
      setPull(resisted);

      // Only now claim the gesture, once it is unambiguously a pull.
      if (e.cancelable && resisted > 4) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!armed.current) return;
      armed.current = false;

      if (pull > THRESHOLD) {
        haptic([8, 40, 8]);
        setRefreshing(true);
        setPull(THRESHOLD);

        router.refresh();

        // Server components stream back; there is no completion event to hook,
        // so hold the indicator long enough to read as work and no longer.
        window.setTimeout(() => {
          setRefreshing(false);
          setPull(0);
        }, 700);
      } else {
        setPull(0);
      }

      start.current = null;
    };

    // passive:false is required — preventDefault is what stops iOS from
    // rubber-banding the whole view instead of running this.
    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd, { passive: true });
    node.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scrollRef, pull, refreshing, router]);

  const ready = pull > THRESHOLD;

  return (
    <>
      <div
        aria-hidden={!refreshing}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
        style={{
          height: pull,
          opacity: Math.min(1, pull / (THRESHOLD * 0.7)),
          transition: pull === 0 ? 'height 260ms var(--ease-ios), opacity 200ms' : 'none',
        }}
      >
        <span
          className="mt-2 flex size-7 items-center justify-center rounded-full bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
          style={{
            transform: `rotate(${refreshing ? 0 : pull * 3}deg)`,
            transition: refreshing ? 'none' : 'transform 60ms linear',
          }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" aria-hidden
            className={refreshing ? 'animate-spin' : undefined}
            fill="none"
            stroke={ready || refreshing ? 'var(--color-brand)' : 'var(--color-muted)'}
            strokeWidth={2.4} strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 3.5V10h-6.5" />
          </svg>
        </span>
      </div>

      <div
        style={{
          transform: `translate3d(0, ${pull}px, 0)`,
          transition: pull === 0 || refreshing ? 'transform 320ms var(--ease-ios)' : 'none',
        }}
      >
        {children}
      </div>
    </>
  );
}
