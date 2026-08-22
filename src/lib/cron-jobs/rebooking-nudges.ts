import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness, loadAvailability } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { inFirstVisitWindow } from '@/lib/retention/first-visit';
import { dispatch } from '@/lib/retention/dispatch';
import { pickSuggestedSlot } from '@/lib/booking/availability';
import { summarize, type CronSummary } from '@/lib/cron';
import { addDays } from '@/lib/utils';

/**
 * ============================================================================
 * REBOOKING NUDGES — the revenue engine's daily run
 * ============================================================================
 * Finds clients who have passed their personal rebooking interval without a
 * next visit booked, and sends them one concrete time rather than a link to a
 * blank calendar.
 *
 * Offering a specific slot — their usual provider, near their usual time —
 * converts substantially better than "book whenever". The whole point of
 * tracking cadence per client is to be able to make that offer accurately.
 * ============================================================================
 */
export async function run(): Promise<CronSummary> {
  const startedAt = Date.now();
  const business = await loadBusiness();
  if (!business) throw new Error('Business not configured.');

  const rules = resolveRules(business.policy);
  const supabase = createAdminClient();
  const results: Array<{ status: string }> = [];
  let slotsSuggested = 0;
  let heldForSequence = 0;

  for (const dayOffset of rules.rebooking.nudgeDayOffsets) {
    // Clients whose expected return date was exactly `dayOffset` days ago.
    const targetDate = addDays(new Date(), -dayOffset).toISOString().slice(0, 10);

    const { data: due } = await supabase
      .from('v_clients_due')
      .select('*')
      .eq('business_id', business.id)
      .gte('next_expected_at', `${targetDate}T00:00:00Z`)
      .lt('next_expected_at', `${targetDate}T23:59:59Z`)
      .order('priority_score', { ascending: false })
      .limit(200);

    const campaignKey =
      dayOffset === 0 ? 'rebook_due'
      : dayOffset <= 7 ? 'rebook_overdue_5'
      : 'rebook_overdue_14';

    for (const client of due ?? []) {
      if (ownedByFirstVisitSequence(rules, client)) {
        heldForSequence++;
        continue;
      }

      if (!client.client_id) continue;

      // Find the one slot worth putting in the message.
      let suggestedText = '';
      const { data: lastVisit } = await supabase
        .from('appointments')
        .select('service_id, staff_id, starts_at')
        .eq('client_id', client.client_id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastVisit?.service_id) {
        const from = new Date().toISOString().slice(0, 10);
        const days = await loadAvailability({
          businessId: business.id,
          serviceId: lastVisit.service_id,
          staffId: client.preferred_staff_id ?? lastVisit.staff_id,
          fromDate: from,
          toDate: addDays(from, 10).toISOString().slice(0, 10),
        });

        const usualHour = lastVisit.starts_at
          ? new Date(lastVisit.starts_at).getUTCHours()
          : null;

        const suggested = pickSuggestedSlot(days, {
          idealDate: new Date(),
          preferStaffId: client.preferred_staff_id ?? lastVisit.staff_id,
          preferHour: usualHour,
          timezone: business.timezone,
        });

        if (suggested) {
          slotsSuggested++;
          suggestedText = new Intl.DateTimeFormat('en-US', {
            timeZone: business.timezone,
            weekday: 'long', hour: 'numeric', minute: '2-digit',
          }).format(new Date(suggested.startsAt));
        }
      }

      const result = await dispatch({
        businessId: business.id,
        campaignKey,
        clientId: client.client_id,
        // One nudge per client per campaign per day, whatever else happens.
        occurrence: `${campaignKey}:${targetDate}`,
        varsOverride: {
          slot: { suggested: suggestedText },
        } as never,
      });
      results.push(result);
    }
  }

  return summarize('rebooking-nudges', startedAt, results, {
    slotsSuggested,
    heldForSequence,
  });
}

/**
 * A brand-new client belongs to the first-visit sequence, which is sending
 * them four messages on its own schedule. Chasing them from here as well is
 * how a mailbox starts reading like a machine.
 *
 * `visit_count === 1` means their last visit is also their first, which is why
 * the view does not need to carry first_visit_at separately.
 */
function ownedByFirstVisitSequence(
  rules: ReturnType<typeof resolveRules>,
  row: { visit_count: number | null; last_visit_at: string | null }
): boolean {
  return inFirstVisitWindow(
    rules.firstVisit,
    row.last_visit_at ? new Date(row.last_visit_at) : null,
    row.visit_count ?? 0,
    new Date()
  );
}
