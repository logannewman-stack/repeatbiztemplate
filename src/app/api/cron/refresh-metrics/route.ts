import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { authorizeCron } from '@/lib/cron';

/**
 * Nightly full recompute of `client_metrics`.
 *
 * Triggers keep the rollup fresh as appointments and orders change, but some
 * fields are time-dependent — a client becomes "due" simply because a day
 * passed, with no row changing. This is what moves those clients into the
 * retention queue.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const startedAt = Date.now();
  const business = await loadBusiness();
  if (!business) {
    return NextResponse.json({ error: 'Business not configured.' }, { status: 500 });
  }

  const supabase = createAdminClient();
  let processed = 0;
  let failed = 0;

  // Page through rather than loading every client into memory; this has to
  // keep working when the client list is large.
  const pageSize = 500;
  for (let page = 0; ; page++) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id')
      .eq('business_id', business.id)
      .is('archived_at', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (!clients?.length) break;

    for (const client of clients) {
      const { error } = await supabase.rpc('refresh_client_metrics', {
        p_client_id: client.id,
      });
      if (error) failed++;
      else processed++;
    }

    if (clients.length < pageSize) break;
  }

  // Expire membership credits that ran past their rollover window.
  const { data: expired } = await supabase
    .from('membership_credit_ledger')
    .select('membership_id, delta')
    .eq('business_id', business.id)
    .gt('delta', 0)
    .lt('expires_at', new Date().toISOString());

  return NextResponse.json({
    job: 'refresh-metrics',
    processed,
    failed,
    creditLedgerRowsExpired: expired?.length ?? 0,
    durationMs: Date.now() - startedAt,
  });
}
