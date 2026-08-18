'use client';

/**
 * Registers the service worker after the page has settled, so it never
 * competes with the first render for bandwidth.
 *
 * In development it does the opposite — unregisters anything already installed.
 * A stale worker serving yesterday's bundle from cache is a genuinely
 * confusing afternoon.
 */

import * as React from 'react';

export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((all) => all.forEach((reg) => reg.unregister()))
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Unsupported, blocked by policy, or served over plain http.
        // The app works without it; only offline support is lost.
      });
    };

    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
