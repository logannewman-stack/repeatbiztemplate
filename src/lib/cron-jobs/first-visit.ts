/**
 * ============================================================================
 * THE FIRST-VISIT SEQUENCE
 * ============================================================================
 * Walks every brand-new client through the four messages that decide whether
 * they come back a second time.
 *
 * This is the highest-value job in the platform. First-visit clients return at
 * roughly half the rate of anyone who has already been twice, and that gap is
 * the largest single number in the research behind this product. One follow-up
 * email does not move it; the sequence is what the spread is worth spending.
 *
 * Runs every few hours rather than daily, because the first stage is two hours
 * after the visit — while the result is fresh and they are still pleased. A
 * daily job would send it the next morning, which is a different message.
 *
 * The timing decisions all live in lib/retention/first-visit.ts, so what fires
 * when is testable without a database. This file reads and sends.
 * ============================================================================
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { dispatch } from '@/lib/retention/dispatch';
import { stageDue } from '@/lib/retention/first-visit';
import { summarize, type CronSummary } from '@/lib/cron';

/** How far back to look for first visits. Past this the sequence is over. */
const LOOKBACK_DAYS = 130;

export async function run(): Promise<CronSummary> {
  const startedAt = Date.now();
  const business = await loadBusiness();
  if (!business) throw new Error('Business not configured.');

  const rules = resolveRules(business.policy);
  const results: Array<{ status: string }> = [];

  if (!rules.firstVisit.enabled) {
    return summarize('first-visit', startedAt, results, { disabled: true });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

  // Everyone whose first visit is recent enough for the sequence to still be
  // running. `visit_count` is maintained by the metrics job, so this does not
  // have to count appointments per client.
  const { data: candidates } = await supabase
    .from('client_metrics')
    .select('client_id, first_visit_at, visit_count, has_future_booking')
    .eq('business_id', business.id)
    .eq('visit_count', 1)
    .gte('first_visit_at', since.toISOString())
    .not('first_visit_at', 'is', null)
    .limit(500);

  let considered = 0;

  for (const row of candidates ?? []) {
    considered++;

    // The visit itself, for its id and the service's rebook interval.
    const { data: visit } = await supabase
      .from('appointments')
      .select('id, completed_at, services(rebook_interval_days)')
      .eq('client_id', row.client_id)
      .eq('status', 'completed')
      .order('completed_at')
      .limit(1)
      .maybeSingle();

    if (!visit?.completed_at) continue;

    const service = visit.services as unknown as
      { rebook_interval_days: number | null } | null;

    // Which stages have already gone out, so a stage never repeats. dispatch()
    // dedupes on the same key as a backstop; this saves the round trip.
    const { data: sent } = await supabase
      .from('campaign_sends')
      .select('dedupe_key')
      .eq('client_id', row.client_id)
      .like('dedupe_key', `%${visit.id}:%`);

    const alreadySent = new Set(
      (sent ?? [])
        .map((s) => String(s.dedupe_key).split(`${visit.id}:`)[1])
        .filter(Boolean)
    );

    const stage = stageDue({
      rules: rules.firstVisit,
      appointmentId: visit.id,
      completedAt: new Date(visit.completed_at),
      rebookIntervalDays: service?.rebook_interval_days ?? 0,
      now,
      alreadySent,
      hasFutureBooking: row.has_future_booking ?? false,
    });

    if (!stage) continue;

    results.push(
      await dispatch({
        businessId: business.id,
        campaignKey: `first_visit_${stage.key}`,
        clientId: row.client_id,
        occurrence: stage.occurrence,
        appointmentId: visit.id,
      })
    );
  }

  return summarize('first-visit', startedAt, results, { considered });
}
