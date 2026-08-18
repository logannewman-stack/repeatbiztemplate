import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness, loadAvailability } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { dispatch } from '@/lib/retention/dispatch';
import { pickSuggestedSlot } from '@/lib/booking/availability';
import { authorizeCron, summarize } from '@/lib/cron';
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
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const startedAt = Date.now();
  const business = await loadBusiness();
  if (!business) {
    return NextResponse.json({ error: 'Business not configured.' }, { status: 500 });
  }

  const rules = resolveRules(business.policy);
  const supabase = createAdminClient();
  const results: Array<{ status: string }> = [];
  let slotsSuggested = 0;

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

  return NextResponse.json(
    summarize('rebooking-nudges', startedAt, results, { slotsSuggested })
  );
}
