/**
 * ============================================================================
 * REBOOKING
 * ============================================================================
 * The single highest-leverage mechanic in the platform.
 *
 * A client who leaves with their next visit on the calendar is worth several
 * times one who leaves without it. Everything here exists to make that next
 * booking the default outcome of a visit rather than a thing someone has to
 * remember to ask for.
 *
 * Three moments, in descending order of effectiveness:
 *   1. At the chair, during checkout — highest conversion by a wide margin
 *   2. In the follow-up message the next morning
 *   3. In the nudge sequence once they pass their usual interval
 * ============================================================================
 */

import { addDays, daysBetween } from '@/lib/utils';
import type { AllRules } from '@/config/rules';

export interface RebookingContext {
  /** Service just completed. */
  serviceRebookIntervalDays: number;
  serviceRebookWindowDays: number;
  /** The client's own observed average, when they have enough history. */
  clientAvgDaysBetweenVisits: number | null;
  completedVisitCount: number;
  lastVisitAt: string | null;
  preferredStaffId: string | null;
  /** Local hour the client usually books at, 0-23. */
  usualHour: number | null;
  hasFutureBooking: boolean;
  now?: Date;
}

export interface RebookingPlan {
  /** The date to pre-select on the rebooking prompt. */
  idealDate: Date;
  /** Acceptable range around it to search for slots. */
  windowStart: Date;
  windowEnd: Date;
  intervalDays: number;
  /** Where the interval came from — shown to staff, not to clients. */
  intervalSource: 'client_history' | 'service_default' | 'business_default';
  preferStaffId: string | null;
  preferHour: number | null;
  /** Copy for the prompt, tuned to how confident we are in the interval. */
  promptHeadline: string;
  promptSubtext: string;
}

/**
 * Work out when this client should come back.
 *
 * A client's own history beats any configured default: someone who reliably
 * returns every 5 weeks for a 6-week service should be offered 5 weeks. Two
 * completed visits is enough to trust the pattern more than the catalog.
 */
export function planRebooking(
  ctx: RebookingContext,
  rules: AllRules
): RebookingPlan {
  const now = ctx.now ?? new Date();

  let intervalDays: number;
  let intervalSource: RebookingPlan['intervalSource'];

  if (
    rules.lapse.usePersonalCadence &&
    ctx.clientAvgDaysBetweenVisits != null &&
    ctx.completedVisitCount >= 2
  ) {
    intervalDays = Math.round(ctx.clientAvgDaysBetweenVisits);
    intervalSource = 'client_history';
  } else if (ctx.serviceRebookIntervalDays > 0) {
    intervalDays = ctx.serviceRebookIntervalDays;
    intervalSource = 'service_default';
  } else {
    intervalDays = rules.rebooking.defaultIntervalDays;
    intervalSource = 'business_default';
  }

  // Guard against a pathological history (a client who came twice in one day).
  intervalDays = Math.max(intervalDays, 1);

  const anchor = ctx.lastVisitAt ? new Date(ctx.lastVisitAt) : now;
  const idealDate = addDays(anchor, intervalDays);

  const window = Math.max(ctx.serviceRebookWindowDays, 3);

  return {
    idealDate,
    windowStart: new Date(Math.max(addDays(idealDate, -window).getTime(), now.getTime())),
    windowEnd: addDays(idealDate, window),
    intervalDays,
    intervalSource,
    preferStaffId: ctx.preferredStaffId,
    preferHour: ctx.usualHour,
    promptHeadline:
      intervalSource === 'client_history'
        ? `You usually come back in about ${intervalDays} days`
        : `Most clients come back in about ${intervalDays} days`,
    promptSubtext:
      'Booking now means the time you want is still open. ' +
      'You can move it any time.',
  };
}

/** Is this client due, overdue, or lapsed right now? */
export function rebookingStatus(
  opts: {
    lastVisitAt: string | null;
    expectedIntervalDays: number;
    hasFutureBooking: boolean;
    now?: Date;
  },
  rules: AllRules
): {
  status: 'not_due' | 'due_soon' | 'due' | 'overdue' | 'lapsed' | 'gone';
  daysSinceVisit: number | null;
  daysOverdue: number;
  /** Fraction of their normal interval elapsed. 1.0 = exactly due. */
  intervalRatio: number;
} {
  const now = opts.now ?? new Date();

  if (!opts.lastVisitAt) {
    return { status: 'not_due', daysSinceVisit: null, daysOverdue: 0, intervalRatio: 0 };
  }

  const daysSince = daysBetween(opts.lastVisitAt, now);
  const interval = Math.max(opts.expectedIntervalDays, 1);
  const ratio = daysSince / interval;
  const daysOverdue = Math.max(daysSince - interval, 0);

  // A booked next visit means they are not due for anything, by definition.
  if (opts.hasFutureBooking) {
    return { status: 'not_due', daysSinceVisit: daysSince, daysOverdue: 0, intervalRatio: ratio };
  }

  const lapseRatio = rules.lapse.lapseMultiplier;

  const status =
    daysSince > rules.lapse.giveUpAfterDays ? 'gone'
    : ratio >= lapseRatio ? 'lapsed'
    : ratio >= 1.25 ? 'overdue'
    : ratio >= 1.0 ? 'due'
    : ratio >= 0.85 ? 'due_soon'
    : 'not_due';

  return { status, daysSinceVisit: daysSince, daysOverdue, intervalRatio: ratio };
}

/**
 * Which winback offer, if any, this client has earned.
 *
 * Offers escalate with time because a client three months gone needs a bigger
 * reason to return than one two weeks gone — but starting with the expensive
 * offer trains people to wait for it, so the cheap one always goes first.
 */
export function selectWinbackOffer(
  daysLapsed: number,
  rules: AllRules
): { kind: 'percent' | 'flat' | 'addon'; value: number; label: string } | null {
  if (daysLapsed > rules.lapse.giveUpAfterDays) return null;

  const eligible = rules.lapse.winbackOffers
    .filter((o) => daysLapsed >= o.afterDays)
    .sort((a, b) => b.afterDays - a.afterDays);

  return eligible[0]
    ? { kind: eligible[0].kind, value: eligible[0].value, label: eligible[0].label }
    : null;
}

/**
 * Loyalty points earned for a visit, including the rebooking bonus.
 * Rewarding the rebook directly is cheap and it works.
 */
export function pointsForVisit(
  opts: { spendCents: number; rebookedAtCheckout: boolean },
  rules: AllRules
): { points: number; breakdown: Array<{ label: string; points: number }> } {
  if (!rules.loyalty.enabled) return { points: 0, breakdown: [] };

  const breakdown: Array<{ label: string; points: number }> = [];

  const base = Math.floor((opts.spendCents / 100) * rules.loyalty.pointsPerDollar);
  if (base > 0) breakdown.push({ label: 'Visit', points: base });

  if (opts.rebookedAtCheckout && rules.loyalty.bonuses.rebookAtCheckout > 0) {
    breakdown.push({
      label: 'Booked your next visit',
      points: rules.loyalty.bonuses.rebookAtCheckout,
    });
  }

  return {
    points: breakdown.reduce((sum, b) => sum + b.points, 0),
    breakdown,
  };
}
