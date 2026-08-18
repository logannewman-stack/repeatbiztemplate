import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { dispatch } from '@/lib/retention/dispatch';
import { summarize, type CronSummary } from '@/lib/cron';

/**
 * Review requests and post-visit follow-ups. Runs daily.
 *
 * Also handles the first-visit follow-up, which is the single most valuable
 * message in the system: whether a new client comes back a second time is
 * where retention is actually decided.
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
    // A client's first completed visit gets the follow-up instead of a review
    // ask — the priority is getting them back, not getting a star rating.
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', appointment.client_id)
      .eq('status', 'completed');

    const isFirstVisit = (count ?? 0) <= 1;

    if (isFirstVisit) {
      firstVisits++;
      results.push(
        await dispatch({
          businessId: business.id,
          campaignKey: 'first_visit_followup',
          clientId: appointment.client_id,
          occurrence: appointment.id,
          appointmentId: appointment.id,
        })
      );
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

  return summarize('review-requests', startedAt, results, { firstVisits });
}
