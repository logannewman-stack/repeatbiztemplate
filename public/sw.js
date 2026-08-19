/**
 * ============================================================================
 * SERVICE WORKER
 * ============================================================================
 * Makes the app launch instantly and survive a dead signal in a basement salon.
 *
 * Deliberately conservative about what it stores:
 *
 *   static assets   cache-first. Next.js fingerprints these, so a cached copy
 *                   is never stale — a changed file has a changed URL.
 *   navigations     network-first, falling back to an offline screen. HTML is
 *                   never written to the cache: /account and an appointment
 *                   detail are specific to whoever is signed in, and a shared
 *                   phone at a front desk must not serve one client's page to
 *                   the next.
 *   /api            not intercepted at all. A stale booking is worse than none.
 * ============================================================================
 */

const VERSION = 'v1';
const STATIC_CACHE = `static-${VERSION}`;
const OFFLINE_URL = '/offline';

// Enough to render something branded with no network at all.
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // Individually, so one 404 does not fail the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.endsWith(VERSION)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/brand/') ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|avif|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Another origin's problem. Passing these through keeps CORS behaviour intact.
  if (url.origin !== self.location.origin) return;

  // Anything that mutates or reads live state goes straight to the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            // Opaque and error responses are not worth persisting.
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (hit) =>
            hit ??
            new Response('Offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
        )
      )
    );
  }
});

/* ============================================================================
 * PUSH
 * ==========================================================================*/

self.addEventListener('push', (event) => {
  // A push with no readable payload still has to show something: web push is
  // granted on the promise that every message is user-visible, and browsers
  // will show their own "site updated in background" notice otherwise.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Update';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      // Android shows this small and monochrome in the status bar.
      badge: '/icons/icon-192.png',
      // Replaces an earlier notification with the same tag rather than
      // stacking — two reminders for one appointment reads as a bug.
      tag: payload.tag || 'general',
      renotify: Boolean(payload.tag),
      requireInteraction: Boolean(payload.requireInteraction),
      data: { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        // Reuse an open window where possible. Launching a second copy of an
        // installed app is jarring and loses whatever the person was doing.
        for (const client of windows) {
          if ('focus' in client) {
            client.navigate?.(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});

// Fired when a subscription is rotated or invalidated by the push service.
// Without this the app goes quiet and neither side knows why.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options ?? { userVisibleOnly: true })
      .then((subscription) =>
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            p256dh: subscription.toJSON().keys.p256dh,
            auth: subscription.toJSON().keys.auth,
            replaces: event.oldSubscription?.endpoint,
          }),
        })
      )
      .catch(() => {
        // Nothing useful to do from here. The app re-registers on next launch.
      })
  );
});
