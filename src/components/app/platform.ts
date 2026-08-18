'use client';

/**
 * ============================================================================
 * PLATFORM
 * ============================================================================
 * Small facts about how the app is being run that change what we render.
 *
 * The important one is `isStandalone`: launched from the home screen there is
 * no back button, no address bar, and no way out of a dead end — so the app
 * has to supply its own back affordance and never render an install prompt.
 * ============================================================================
 */

import * as React from 'react';

export interface Platform {
  /** Running from the home screen with no browser chrome. */
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  /** True until the first effect runs; render neutral until then. */
  isPending: boolean;
}

const INITIAL: Platform = {
  isStandalone: false,
  isIOS: false,
  isAndroid: false,
  isPending: true,
};

export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return INITIAL;

  const ua = window.navigator.userAgent;

  // iPadOS 13+ reports as a Mac, so touch points are the only reliable tell.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari never adopted display-mode for home-screen apps.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return { isStandalone, isIOS, isAndroid: /Android/.test(ua), isPending: false };
}

export function usePlatform(): Platform {
  // Server and first client render must agree, so detection waits for an
  // effect. Components branch on isPending rather than flashing wrong chrome.
  const [platform, setPlatform] = React.useState<Platform>(INITIAL);

  React.useEffect(() => {
    setPlatform(detectPlatform());

    const query = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setPlatform(detectPlatform());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return platform;
}

/**
 * A short tap of haptic feedback.
 *
 * iOS Safari does not implement the Vibration API at all, so this is a no-op
 * on the platform people most associate with haptics. It is still worth
 * calling: Android delivers it, and it costs nothing where it is missing.
 */
export function haptic(pattern: number | number[] = 8): void {
  if (typeof window === 'undefined') return;
  if (!('vibrate' in window.navigator)) return;
  try {
    window.navigator.vibrate(pattern);
  } catch {
    // Blocked by a permissions policy on some embedded browsers. Not fatal.
  }
}
