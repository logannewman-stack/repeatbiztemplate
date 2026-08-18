import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { dispatch } from '@/lib/retention/dispatch';
import { summarize, type CronSummary } from '@/lib/cron';

/**
 * Appointment reminders. Runs hourly.
 *
 * For each configured lead time, find appointments falling in that hour and
 * send. The dedupe key is (campaign, client, appointment), so re-running the
 * job — or a Vercel retry — cannot double-message anyone.
 */
export async function run(): Promise<CronSummary> {
  const startedAt = Date.now();
  const business = await loadBusiness();
  if (!business) throw new Error('Business not configured.');

  const rules = resolveRules(business.policy);
  const supabase = createAdminClient();
  const results: Array<{ status: string }> = [];

  for (const hoursBefore of rules.reminders.scheduleHoursBefore) {
    const windowStart = new Date(Date.now() + hoursBefore * 3_600_000);
    const windowEnd = new Date(windowStart.getTime() + 3_600_000);

    const { data: appointments } = await supabase
      .from('appointments')
      .select('id, client_id')
      .eq('business_id', business.id)
      .in('status', ['booked', 'confirmed'])
      .gte('starts_at', windowStart.toISOString())
      .lt('starts_at', windowEnd.toISOString());

    const campaignKey =
      hoursBefore >= 48 ? 'reminder_72h'
      : hoursBefore >= 12 ? 'reminder_24h'
      : 'reminder_3h';

    for (const appointment of appointments ?? []) {
      const result = await dispatch({
        businessId: business.id,
        campaignKey,
        clientId: appointment.client_id,
        occurrence: appointment.id,
        appointmentId: appointment.id,
        transactional: true,
      });
      results.push(result);
    }
  }

  return summarize('reminders', startedAt, results);
}
