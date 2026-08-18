import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness, loadAvailability } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { dispatch } from '@/lib/retention/dispatch';
import { authorizeCron, summarize } from '@/lib/cron';

/**
 * ============================================================================
 * WAITLIST FILL — turns cancellations into revenue. Runs every 15 minutes.
 * ============================================================================
 * When a slot frees up, an empty chair is pure loss: the cost is already sunk.
 * This matches open time against waiting clients and offers it to one at a
 * time, on a claim clock, so two people are never sent the same slot.
 *
 * Members are served first — priority access is a benefit they paid for, and
 * honoring it visibly is part of what makes the membership worth renewing.
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
  let expired = 0;
  let offered = 0;

  // --- Expire stale offers so the slot rotates to the next person ----------

  const { data: staleOffers } = await supabase
    .from('waitlist_entries')
    .select('id')
    .eq('business_id', business.id)
    .eq('status', 'offered')
    .lt('offer_expires_at', new Date().toISOString());

  for (const entry of staleOffers ?? []) {
    await supabase
      .from('waitlist_entries')
      .update({ status: 'waiting', offered_at: null, offer_expires_at: null, offered_appointment_slot: null })
      .eq('id', entry.id);
    expired++;
  }

  // --- Match waiting entries against real availability ---------------------

  const { data: waiting } = await supabase
    .from('waitlist_entries')
    .select('*')
    .eq('business_id', business.id)
    .eq('status', 'waiting')
    .gte('window_end', new Date().toISOString())
    // Priority first (members, VIPs), then longest-waiting.
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(50);

  // Slots promised inside this run, so two entries never get the same one.
  const claimed = new Set<string>();

  for (const entry of waiting ?? []) {
    const fromDate = new Date(
      Math.max(new Date(entry.window_start).getTime(), Date.now())
    ).toISOString().slice(0, 10);
    const toDate = new Date(entry.window_end).toISOString().slice(0, 10);

    const days = await loadAvailability({
      businessId: business.id,
      serviceId: entry.service_id,
      staffId: entry.staff_id,
      locationId: entry.location_id,
      fromDate,
      toDate,
    });

    const match = days
      .flatMap((d) => d.slots)
      .filter((slot) => {
        const key = `${slot.startsAt}:${slot.staffId}`;
        if (claimed.has(key)) return false;

        const start = new Date(slot.startsAt);
        if (start < new Date(entry.window_start)) return false;
        if (start > new Date(entry.window_end)) return false;

        // Respect the client's stated day and time-of-day preferences —
        // offering a slot they already said they cannot take wastes the
        // claim window and the slot.
        if (entry.preferred_weekdays?.length) {
          if (!entry.preferred_weekdays.includes(start.getUTCDay())) return false;
        }
        if (entry.earliest_time || entry.latest_time) {
          const hhmm = start.toISOString().slice(11, 16);
          if (entry.earliest_time && hhmm < entry.earliest_time.slice(0, 5)) return false;
          if (entry.latest_time && hhmm > entry.latest_time.slice(0, 5)) return false;
        }
        return true;
      })[0];

    if (!match) continue;

    claimed.add(`${match.startsAt}:${match.staffId}`);
    offered++;

    const expiresAt = new Date(
      Date.now() + rules.cancellation.waitlistClaimWindowMinutes * 60_000
    );

    await supabase
      .from('waitlist_entries')
      .update({
        status: 'offered',
        offered_at: new Date().toISOString(),
        offer_expires_at: expiresAt.toISOString(),
        offered_appointment_slot: {
          startsAt: match.startsAt,
          endsAt: match.endsAt,
          staffId: match.staffId,
          staffName: match.staffName,
          priceCents: match.priceCents,
        },
      })
      .eq('id', entry.id);

    const result = await dispatch({
      businessId: business.id,
      campaignKey: 'waitlist_offer',
      clientId: entry.client_id,
      occurrence: `${entry.id}:${match.startsAt}`,
      transactional: true,
      varsOverride: {
        slot: {
          suggested: new Intl.DateTimeFormat('en-US', {
            timeZone: business.timezone,
            weekday: 'long', hour: 'numeric', minute: '2-digit',
          }).format(new Date(match.startsAt)),
        },
        offer: {
          expires_minutes: rules.cancellation.waitlistClaimWindowMinutes,
        },
      } as never,
    });
    results.push(result);
  }

  return NextResponse.json(
    summarize('waitlist-fill', startedAt, results, { expired, offered })
  );
}
