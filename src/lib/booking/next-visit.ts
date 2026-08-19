/**
 * ============================================================================
 * NEXT VISIT
 * ============================================================================
 * What the app should say to this person the moment they open it.
 *
 * There are only three useful answers, and which one applies is the whole
 * retention loop:
 *
 *   upcoming  they have a booking → show it, and let them confirm it in one
 *             tap, because an unconfirmed appointment is the population that
 *             no-shows
 *   due       their usual interval has elapsed with nothing booked → offer the
 *             date, pre-filled, so rebooking is a confirmation rather than a
 *             decision
 *   none      new or dormant → nothing to say; the ordinary booking flow is
 *             the right call to action
 *
 * The `due` case is the one worth building carefully. Rebooking is decided in
 * the ninety seconds after a visit, and everything after that is a marketing
 * campaign against someone's calendar. Putting a concrete date in front of
 * them is the cheapest way to win that argument later.
 * ============================================================================
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/demo';

export type NextVisit =
  | {
      kind: 'upcoming';
      appointmentId: string;
      startsAt: string;
      serviceName: string;
      staffName: string | null;
      confirmed: boolean;
      /** Whole days from now. Negative should not occur; clamped at 0. */
      daysAway: number;
    }
  | {
      kind: 'due';
      serviceId: string;
      serviceName: string;
      /** YYYY-MM-DD, the client's usual interval after their last visit. */
      suggestedDate: string;
      /** How far past their usual interval they already are. */
      daysOverdue: number;
      lastVisitAt: string;
    }
  | { kind: 'none' };

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export async function loadNextVisit(): Promise<NextVisit> {
  if (!isSupabaseConfigured()) return { kind: 'none' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { kind: 'none' };

    const admin = createAdminClient();

    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!client) return { kind: 'none' };

    const now = new Date();

    // --- Something already booked? ------------------------------------------
    const { data: upcoming } = await admin
      .from('appointments')
      .select('id, starts_at, status, services(name), staff(display_name)')
      .eq('client_id', client.id)
      .in('status', ['booked', 'confirmed'])
      .gte('starts_at', now.toISOString())
      .order('starts_at')
      .limit(1)
      .maybeSingle();

    if (upcoming) {
      const service = upcoming.services as unknown as { name: string } | null;
      const staff = upcoming.staff as unknown as { display_name: string } | null;

      return {
        kind: 'upcoming',
        appointmentId: upcoming.id,
        startsAt: upcoming.starts_at,
        serviceName: service?.name ?? 'Your appointment',
        staffName: staff?.display_name ?? null,
        confirmed: upcoming.status === 'confirmed',
        daysAway: Math.max(0, wholeDaysBetween(now, new Date(upcoming.starts_at))),
      };
    }

    // --- Nothing booked. Are they due? --------------------------------------
    const { data: last } = await admin
      .from('appointments')
      .select('completed_at, service_id, services(name, rebook_interval_days)')
      .eq('client_id', client.id)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!last?.completed_at || !last.service_id) return { kind: 'none' };

    const service = last.services as unknown as {
      name: string;
      rebook_interval_days: number | null;
    } | null;

    const interval = service?.rebook_interval_days ?? 0;
    // A service with no interval configured has no opinion about when to
    // return, and inventing one produces nagging rather than a nudge.
    if (interval <= 0) return { kind: 'none' };

    const lastVisit = new Date(last.completed_at);
    const dueAt = new Date(lastVisit.getTime() + interval * 86_400_000);
    const daysOverdue = wholeDaysBetween(dueAt, now);

    // Surface it from a week out, so the offer lands before the habit lapses
    // rather than after.
    if (daysOverdue < -7) return { kind: 'none' };

    // Never propose a date in the past.
    const suggested = daysOverdue > 0 ? new Date(now.getTime() + 86_400_000) : dueAt;

    return {
      kind: 'due',
      serviceId: last.service_id,
      serviceName: service?.name ?? 'your usual',
      suggestedDate: suggested.toISOString().slice(0, 10),
      daysOverdue: Math.max(0, daysOverdue),
      lastVisitAt: last.completed_at,
    };
  } catch {
    // The home screen must render regardless. Losing this card costs a nudge;
    // throwing costs the whole page.
    return { kind: 'none' };
  }
}
