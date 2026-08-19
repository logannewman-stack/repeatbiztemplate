/**
 * ============================================================================
 * WEB PUSH
 * ============================================================================
 * Sending half of the push channel. The subscribing half is in
 * src/components/app/push.ts, and the two have to agree about iOS:
 *
 *   Safari delivers web push only to a site the user has added to their Home
 *   Screen, and only when it is opened from that icon. A subscription
 *   therefore does not exist for most iPhone visitors, and its absence is the
 *   normal case rather than a fault.
 *
 * Everything here is written for that. A client with no subscription is not
 * an error; it is a client who should get an SMS instead.
 *
 * Payloads are encrypted to the browser's own keys, so the push service
 * relays them without being able to read them. That is also why a lost
 * subscription cannot be recovered — only re-created by the browser.
 * ============================================================================
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface PushPayload {
  title: string;
  body: string;
  /** Where a tap should land. Relative to the app origin. */
  url?: string;
  /** Collapses earlier notifications with the same tag, as iOS expects. */
  tag?: string;
  /** Survives until dismissed. For a same-day reminder, not an offer. */
  requireInteraction?: boolean;
}

export interface PushSendResult {
  ok: boolean;
  /** Subscriptions that accepted the message. */
  delivered: number;
  /** Subscriptions the push service reported as permanently gone. */
  pruned: number;
  error: string | null;
  simulated: boolean;
}

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  );
}

/**
 * The public key the browser needs to subscribe. Exposed to the client, which
 * is fine — it is public by design. The private key must never leave here.
 */
export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

/**
 * Imported lazily and configured on first use. `web-push` pulls in Node
 * crypto, so a static import would drag it into any bundle that touches this
 * module — including the middleware, which cannot run it.
 */
async function loadWebPush() {
  const webpush = (await import('web-push')).default;

  webpush.setVapidDetails(
    // A mailto: subject is required by the spec so a push service has someone
    // to contact about a misbehaving sender.
    process.env.VAPID_SUBJECT || `mailto:${process.env.EMAIL_FROM || 'noreply@example.com'}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  return webpush;
}

/** A push service saying this endpoint is gone for good, not busy. */
function isGone(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

export async function sendPushToClient(
  clientId: string,
  payload: PushPayload
): Promise<PushSendResult> {
  if (!isPushConfigured()) {
    console.info(`[messaging] PUSH (simulated) client=${clientId} ${payload.title}`);
    return { ok: true, delivered: 0, pruned: 0, error: null, simulated: true };
  }

  const supabase = createAdminClient();

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('client_id', clientId);

  if (error) {
    return { ok: false, delivered: 0, pruned: 0, error: error.message, simulated: false };
  }

  if (!subscriptions?.length) {
    // Expected for anyone who has not installed the app. The caller falls
    // back to SMS.
    return {
      ok: false, delivered: 0, pruned: 0,
      error: 'no_subscription', simulated: false,
    };
  }

  const webpush = await loadWebPush();
  const body = JSON.stringify(payload);

  let delivered = 0;
  let pruned = 0;
  const deadIds: string[] = [];
  let lastError: string | null = null;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          {
            // Hold it for a day at most. A reminder that arrives after the
            // appointment is worse than one that never arrives.
            TTL: 60 * 60 * 24,
            urgency: 'normal',
          }
        );
        delivered += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;

        if (isGone(status)) {
          deadIds.push(sub.id);
          pruned += 1;
        } else {
          lastError = err instanceof Error ? err.message : String(err);
          // Count it, so a permanently flaky endpoint eventually gets retired
          // by the cleanup job rather than retried on every campaign.
          await supabase
            .from('push_subscriptions')
            .update({
              failure_count: 1,
              last_failed_at: new Date().toISOString(),
            })
            .eq('id', sub.id);
        }
      }
    })
  );

  if (deadIds.length) {
    // The browser will re-subscribe on next launch if the user still wants
    // notifications. Keeping a dead endpoint only slows every future send.
    await supabase.from('push_subscriptions').delete().in('id', deadIds);
  }

  return {
    ok: delivered > 0,
    delivered,
    pruned,
    error: delivered > 0 ? null : (lastError ?? 'all_endpoints_failed'),
    simulated: false,
  };
}
