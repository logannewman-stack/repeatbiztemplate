'use client';

/**
 * ============================================================================
 * PUSH SUBSCRIPTION
 * ============================================================================
 * Client half of the push channel. Three platform facts shape all of it:
 *
 * 1. On iOS, web push works only for an app added to the Home Screen and
 *    opened from that icon. Called from a Safari tab, `requestPermission`
 *    resolves without ever showing a prompt — and a permission that was never
 *    really asked for cannot be asked for again. So on iPhone the install has
 *    to come first, and asking early spends the one chance you get.
 *
 * 2. Permission must be requested from a user gesture. Not on mount, not
 *    after a timer — inside the click handler, synchronously enough that the
 *    browser still credits the gesture.
 *
 * 3. Subscriptions expire silently after long inactivity, particularly on
 *    iOS. The stored endpoint is a cache, not a fact, so the app re-checks it
 *    on every launch instead of trusting what the server has.
 * ============================================================================
 */

import * as React from 'react';
import { detectPlatform } from './platform';

export type PushState =
  | 'unsupported'      // no service worker or no Push API
  | 'needs-install'    // iOS in a browser tab: nothing to ask for yet
  | 'prompt'           // can ask
  | 'granted'          // subscribed and registered with the server
  | 'denied';          // asked and refused; only Settings can undo it

export interface PushStatus {
  state: PushState;
  /** True while an enable/disable round-trip is running. */
  busy: boolean;
  error: string | null;
}

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes.
 *
 * The buffer is allocated explicitly so the result is `Uint8Array<ArrayBuffer>`
 * rather than `Uint8Array<ArrayBufferLike>` — the latter could be backed by a
 * SharedArrayBuffer, which `BufferSource` does not accept.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const normalised = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);

  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function keyToBase64(key: ArrayBuffer | null): string {
  if (!key) return '';
  const bytes = new Uint8Array(key);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function registerWithServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON() as { keys?: { p256dh?: string; auth?: string } };

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? keyToBase64(subscription.getKey('p256dh')),
      auth: json.keys?.auth ?? keyToBase64(subscription.getKey('auth')),
      userAgent: navigator.userAgent,
    }),
  });

  if (!res.ok) {
    throw new Error(`Could not save this device (${res.status}).`);
  }
}

export function usePush(vapidPublicKey: string | null) {
  const [status, setStatus] = React.useState<PushStatus>({
    state: 'unsupported',
    busy: false,
    error: null,
  });

  // Resolve the real state once mounted, and re-confirm the subscription the
  // server holds still exists in this browser.
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isSupported() || !vapidPublicKey) {
        if (!cancelled) setStatus((s) => ({ ...s, state: 'unsupported' }));
        return;
      }

      const { isIOS, isStandalone } = detectPlatform();

      // On iPhone in a tab there is genuinely nothing to offer yet. Say so
      // rather than showing a button that would silently do nothing.
      if (isIOS && !isStandalone) {
        if (!cancelled) setStatus((s) => ({ ...s, state: 'needs-install' }));
        return;
      }

      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus((s) => ({ ...s, state: 'denied' }));
        return;
      }

      if (Notification.permission !== 'granted') {
        if (!cancelled) setStatus((s) => ({ ...s, state: 'prompt' }));
        return;
      }

      // Permission is granted — but that does not mean a live subscription
      // exists. This is the case iOS silently breaks.
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();

        if (existing) {
          // Re-register unconditionally. It is a cheap upsert, and it repairs
          // the case where the server lost the row or the endpoint rotated.
          await registerWithServer(existing);
          if (!cancelled) setStatus((s) => ({ ...s, state: 'granted' }));
        } else if (!cancelled) {
          // Granted but unsubscribed: offer to turn it back on. Re-subscribing
          // needs no new prompt, so this resolves in one tap.
          setStatus((s) => ({ ...s, state: 'prompt' }));
        }
      } catch {
        if (!cancelled) setStatus((s) => ({ ...s, state: 'prompt' }));
      }
    })();

    return () => { cancelled = true; };
  }, [vapidPublicKey]);

  /** Must be called directly from a click handler — see note 2 above. */
  const enable = React.useCallback(async () => {
    if (!vapidPublicKey || !isSupported()) return;

    setStatus((s) => ({ ...s, busy: true, error: null }));

    try {
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        setStatus({
          state: permission === 'denied' ? 'denied' : 'prompt',
          busy: false,
          error: null,
        });
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Non-visible pushes are not permitted for web push; every message
          // this app sends shows a notification anyway.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      await registerWithServer(subscription);
      setStatus({ state: 'granted', busy: false, error: null });
    } catch (err) {
      setStatus({
        state: 'prompt',
        busy: false,
        error: err instanceof Error ? err.message : 'Could not turn on notifications.',
      });
    }
  }, [vapidPublicKey]);

  const disable = React.useCallback(async () => {
    setStatus((s) => ({ ...s, busy: true, error: null }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      // Browser permission stays granted; only the subscription is gone. That
      // is what lets re-enabling work without a second prompt.
      setStatus({ state: 'prompt', busy: false, error: null });
    } catch (err) {
      setStatus((s) => ({
        ...s,
        busy: false,
        error: err instanceof Error ? err.message : 'Could not turn notifications off.',
      }));
    }
  }, []);

  return { ...status, enable, disable };
}
