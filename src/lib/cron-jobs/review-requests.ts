import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { dispatch } from '@/lib/retention/dispatch';
import { summarize, type CronSummary } from '@/lib/cron';

/**
 * Review requests and no-show follow-ups. Runs daily.
 *
 * First visits are skipped here on purpose: they belong to the first-visit
 * sequence in cron-jobs/first-visit.ts. Asking someone for a review before
 * they have decided whether they are coming back is the wrong question at the
 * wrong time, and it spends the one message they will actually read.
 */
export async function run(): Promise<CronSummary> {
  const startedAt = Date.now();
  const business = await loadBusiness();
  if (!business) throw new Error('Business not configured.');

  const rules = resolveRules(business.policy);
  const supabase = createAdminClient();
  const results: Array<{ status: string }> = [];
  let firstVisits = 0;

  const since = new Date(
    Date.now() - (rules.reviews.requestDelayHours + 24) * 3_600_000
  );
  const until = new Date(Date.now() - rules.reviews.requestDelayHours * 3_600_000);

  const { data: completed } = await supabase
    .from('appointments')
    .select('id, client_id, completed_at')
    .eq('business_id', business.id)
    .eq('status', 'completed')
    .gte('completed_at', since.toISOString())
    .lt('completed_at', until.toISOString());

  for (const appointment of completed ?? []) {
    // A first visit belongs to the first-visit sequence, which runs on its own
    // schedule and sends four messages rather than one. Asking a brand-new
    // client for a review before they have decided whether they are coming
    // back is the wrong question at the wrong time.
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', appointment.client_id)
      .eq('status', 'completed');

    if ((count ?? 0) <= 1) {
      firstVisits++;
      continue;
    }

    if (!rules.reviews.enabled) continue;

    results.push(
      await dispatch({
        businessId: business.id,
        campaignKey: 'review_request',
        clientId: appointment.client_id,
        occurrence: appointment.id,
        appointmentId: appointment.id,
      })
    );
  }

  // --- No-show follow-ups --------------------------------------------------
  // A no-show is not necessarily a lost client, but the window is short.

  const { data: noShows } = await supabase
    .from('appointments')
    .select('id, client_id')
    .eq('business_id', business.id)
    .eq('status', 'no_show')
    .gte('no_show_at', new Date(Date.now() - 26 * 3_600_000).toISOString())
    .lt('no_show_at', new Date(Date.now() - 2 * 3_600_000).toISOString());

  for (const appointment of noShows ?? []) {
    results.push(
      await dispatch({
        businessId: business.id,
        campaignKey: 'no_show_followup',
        clientId: appointment.client_id,
        occurrence: appointment.id,
        appointmentId: appointment.id,
      })
    );
  }

  return summarize('review-requests', startedAt, results, {
    skippedFirstVisits: firstVisits,
  });
}
