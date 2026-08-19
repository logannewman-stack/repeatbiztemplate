import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/demo';

/**
 * Register this browser to receive push notifications.
 *
 * Called from three places, all of which must be safe to repeat: turning
 * notifications on, every app launch (to repair a subscription iOS quietly
 * dropped), and the service worker's `pushsubscriptionchange` handler.
 * The upsert on `endpoint` is what makes that true.
 */

export const dynamic = 'force-dynamic';

interface Body {
  endpoint?: unknown;
  p256dh?: unknown;
  auth?: unknown;
  userAgent?: unknown;
  /** Endpoint this one supersedes, when the push service rotated it. */
  replaces?: unknown;
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { endpoint, p256dh, auth, userAgent, replaces } = body;

  if (!isNonEmptyString(endpoint) || !isNonEmptyString(p256dh) || !isNonEmptyString(auth)) {
    return NextResponse.json({ error: 'missing_subscription_fields' }, { status: 400 });
  }

  // An endpoint is a push-service URL. Refusing anything else keeps this from
  // being used to point the sender at an arbitrary host.
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Notifications are per-client, so there has to be a client to attach to.
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, business_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: 'no_client_record' }, { status: 404 });
  }

  // Drop the superseded row first so a rotated endpoint does not leave a dead
  // one behind that every future send still tries.
  if (isNonEmptyString(replaces) && replaces !== endpoint) {
    await admin.from('push_subscriptions').delete().eq('endpoint', replaces);
  }

  const { error } = await admin.from('push_subscriptions').upsert(
    {
      business_id: client.business_id,
      client_id: client.id,
      endpoint,
      p256dh,
      auth,
      user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 400) : null,
      last_seen_at: new Date().toISOString(),
      // A re-registration means the browser considers it live again, so any
      // earlier failures are stale.
      failure_count: 0,
      last_failed_at: null,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
