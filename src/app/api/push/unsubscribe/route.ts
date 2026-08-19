import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/demo';

/**
 * Stop sending push to this browser.
 *
 * Scoped to the signed-in client's own rows: an endpoint is a bearer-ish
 * string, and without the ownership check anyone holding one could unsubscribe
 * somebody else's device.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let endpoint: unknown;
  try {
    ({ endpoint } = await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (typeof endpoint !== 'string' || !endpoint) {
    return NextResponse.json({ error: 'missing_endpoint' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: 'no_client_record' }, { status: 404 });
  }

  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('client_id', client.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
