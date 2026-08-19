/**
 * ============================================================================
 * IMPACT
 * ============================================================================
 * Reads v_impact and turns it into the one screen that answers "is this
 * working?" — the business's own opening numbers against its current ones.
 *
 * The honesty rules here are deliberate and load-bearing, because this screen
 * is the renewal conversation:
 *
 *   - Below sixty days of history there is no comparison, and we say so
 *     rather than showing a delta computed from overlapping windows.
 *   - A metric that got worse is reported as having got worse. Value is
 *     floored at zero, never negative, and never quietly hidden.
 *
 * A number an owner catches you inflating costs more than every number on the
 * page is worth.
 * ============================================================================
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { loadBrand } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/demo';

export interface Impact {
  daysLive: number;
  /** False until 60 days of history exist. Do not render deltas when false. */
  comparable: boolean;
  lifetimeAppointments: number;

  rebookRateBaseline: number | null;
  rebookRateCurrent: number | null;
  rebookRateDelta: number;

  noShowRateBaseline: number | null;
  noShowRateCurrent: number | null;
  /** Negative is an improvement — fewer no-shows. */
  noShowRateDelta: number;

  bookedCurrent: number;
  avgTicketCents: number;
  feesRecoveredCents: number;

  mrrCentsBaseline: number;
  mrrCentsCurrent: number;
  membersCurrent: number;

  rebookingValueCents: number;
  noShowValueCents: number;
  membershipValueCents: number;
  /** The three above, summed. Monthly. */
  totalValueCents: number;

  demo: boolean;
}

/** Shape used for the demo screen, and the fallback when nothing is wired up. */
const DEMO: Impact = {
  daysLive: 187,
  comparable: true,
  lifetimeAppointments: 1_842,

  rebookRateBaseline: 34.0,
  rebookRateCurrent: 58.5,
  rebookRateDelta: 24.5,

  noShowRateBaseline: 11.4,
  noShowRateCurrent: 4.1,
  noShowRateDelta: -7.3,

  bookedCurrent: 268,
  avgTicketCents: 11_400,
  feesRecoveredCents: 34_200,

  mrrCentsBaseline: 0,
  mrrCentsCurrent: 486_000,
  membersCurrent: 41,

  rebookingValueCents: 685_000,
  noShowValueCents: 223_000,
  membershipValueCents: 486_000,
  totalValueCents: 1_394_000,

  demo: true,
};

export async function loadImpact(): Promise<Impact> {
  if (!isSupabaseConfigured()) return DEMO;

  const { businessId } = await loadBrand();
  if (!businessId) return DEMO;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('v_impact')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();

    if (error || !data) return DEMO;

    const rebooking = Number(data.rebooking_value_cents ?? 0);
    const noShow = Number(data.no_show_value_cents ?? 0);
    const membership = Number(data.membership_value_cents ?? 0);

    return {
      daysLive: Number(data.days_live ?? 0),
      comparable: Boolean(data.comparable),
      lifetimeAppointments: Number(data.lifetime_appointments ?? 0),

      rebookRateBaseline: data.rebook_rate_baseline as number | null,
      rebookRateCurrent: data.rebook_rate_current as number | null,
      rebookRateDelta: Number(data.rebook_rate_delta ?? 0),

      noShowRateBaseline: data.no_show_rate_baseline as number | null,
      noShowRateCurrent: data.no_show_rate_current as number | null,
      noShowRateDelta: Number(data.no_show_rate_delta ?? 0),

      bookedCurrent: Number(data.booked_current ?? 0),
      avgTicketCents: Number(data.avg_ticket_cents ?? 0),
      feesRecoveredCents: Number(data.fees_recovered_cents ?? 0),

      mrrCentsBaseline: Number(data.mrr_cents_baseline ?? 0),
      mrrCentsCurrent: Number(data.mrr_cents_current ?? 0),
      membersCurrent: Number(data.members_current ?? 0),

      rebookingValueCents: rebooking,
      noShowValueCents: noShow,
      membershipValueCents: membership,
      totalValueCents: rebooking + noShow + membership,

      demo: false,
    };
  } catch {
    // A reporting screen must never be the thing that takes admin down.
    return DEMO;
  }
}

/**
 * Annualised, for the version of this conversation that happens once a year.
 * Membership MRR is already recurring; the other two are monthly run-rates.
 */
export function annualised(impact: Impact): number {
  return impact.totalValueCents * 12;
}
