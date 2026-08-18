/**
 * ============================================================================
 * CANCELLATION POLICY ENGINE
 * ============================================================================
 * Decides what happens when a client wants out of an appointment.
 *
 * The design principle here is that a cancellation is a failure state and a
 * reschedule is not. A rescheduled appointment keeps the revenue and keeps the
 * relationship; a cancelled one usually loses both. So the flow always leads
 * with reschedule options, and the fee schedule is built to make rescheduling
 * the obviously better choice rather than to punish people.
 * ============================================================================
 */

import { percentOf } from '@/lib/utils';
import type { AllRules } from '@/config/rules';

export interface CancellationContext {
  startsAt: string;
  servicePriceCents: number;
  addonsCents: number;
  depositCents: number;
  depositPaidAt: string | null;
  rescheduleCount: number;
  isMember: boolean;
  /** Cancellations initiated by the business are never charged. */
  initiatedBy: 'client' | 'staff' | 'system';
  now?: Date;
}

export interface CancellationOutcome {
  /** Whether the client is allowed to self-serve this at all. */
  allowed: boolean;
  hoursUntilAppointment: number;
  /** Inside the free window. */
  isFree: boolean;
  feeCents: number;
  feePercent: number;
  /** Human-readable, shown before they confirm. Never a surprise charge. */
  feeExplanation: string | null;
  /** Matched tier label, for reporting. */
  tierLabel: string | null;
  /** Deposit is forfeited rather than separately charged. */
  depositForfeited: boolean;
  /** Amount to refund back to the client, if any. */
  refundCents: number;
  /** Lead with these instead of the cancel button. */
  shouldOfferReschedule: boolean;
  /** Free reschedules remaining on this appointment. */
  freeReschedulesLeft: number;
}

export function evaluateCancellation(
  ctx: CancellationContext,
  rules: AllRules
): CancellationOutcome {
  const now = ctx.now ?? new Date();
  const start = new Date(ctx.startsAt).getTime();
  const hoursUntil = (start - now.getTime()) / 3_600_000;

  const c = rules.cancellation;
  const totalValue = ctx.servicePriceCents + ctx.addonsCents;

  const freeReschedulesLeft = Math.max(
    c.freeReschedulesPerAppointment - ctx.rescheduleCount,
    0
  );

  // The business cancelling is never the client's problem.
  if (ctx.initiatedBy !== 'client') {
    return {
      allowed: true,
      hoursUntilAppointment: hoursUntil,
      isFree: true,
      feeCents: 0,
      feePercent: 0,
      feeExplanation: null,
      tierLabel: null,
      depositForfeited: false,
      refundCents: ctx.depositPaidAt ? ctx.depositCents : 0,
      shouldOfferReschedule: true,
      freeReschedulesLeft,
    };
  }

  // Outside the fee window entirely.
  if (hoursUntil >= c.freeCancellationHours) {
    return {
      allowed: true,
      hoursUntilAppointment: hoursUntil,
      isFree: true,
      feeCents: 0,
      feePercent: 0,
      feeExplanation: null,
      tierLabel: null,
      depositForfeited: false,
      refundCents: ctx.depositPaidAt ? ctx.depositCents : 0,
      shouldOfferReschedule: c.rescheduleFirst,
      freeReschedulesLeft,
    };
  }

  // Tiers are declared shortest-notice first; the first match is the harshest
  // that applies.
  const tiers = [...c.feeTiers].sort((a, b) => a.withinHours - b.withinHours);
  const tier = tiers.find((t) => hoursUntil < t.withinHours);

  if (!tier) {
    return {
      allowed: true,
      hoursUntilAppointment: hoursUntil,
      isFree: true,
      feeCents: 0,
      feePercent: 0,
      feeExplanation: null,
      tierLabel: null,
      depositForfeited: false,
      refundCents: ctx.depositPaidAt ? ctx.depositCents : 0,
      shouldOfferReschedule: c.rescheduleFirst,
      freeReschedulesLeft,
    };
  }

  const grossFee = percentOf(totalValue, tier.feePercent);

  // A paid deposit is applied against the fee rather than charged on top.
  const depositApplied = ctx.depositPaidAt ? Math.min(ctx.depositCents, grossFee) : 0;
  const netFee = grossFee - depositApplied;
  const refund = ctx.depositPaidAt ? Math.max(ctx.depositCents - grossFee, 0) : 0;

  return {
    allowed: true,
    hoursUntilAppointment: hoursUntil,
    isFree: false,
    feeCents: netFee,
    feePercent: tier.feePercent,
    feeExplanation:
      `${tier.label}: a ${tier.feePercent}% late cancellation fee applies` +
      (depositApplied > 0 ? ', covered by your deposit' : '') +
      '.',
    tierLabel: tier.label,
    depositForfeited: depositApplied > 0,
    refundCents: refund,
    shouldOfferReschedule: c.rescheduleFirst,
    freeReschedulesLeft,
  };
}

export interface RescheduleOutcome {
  allowed: boolean;
  isFree: boolean;
  feeCents: number;
  /** Why a reschedule is being refused or charged. */
  explanation: string | null;
  freeReschedulesLeft: number;
}

/**
 * Rescheduling is deliberately more generous than cancelling: the whole point
 * is to make moving an appointment the path of least resistance.
 */
export function evaluateReschedule(
  ctx: CancellationContext,
  rules: AllRules
): RescheduleOutcome {
  const now = ctx.now ?? new Date();
  const hoursUntil = (new Date(ctx.startsAt).getTime() - now.getTime()) / 3_600_000;
  const c = rules.cancellation;

  const freeReschedulesLeft = Math.max(
    c.freeReschedulesPerAppointment - ctx.rescheduleCount, 0
  );

  if (freeReschedulesLeft <= 0) {
    return {
      allowed: true,
      isFree: false,
      feeCents: percentOf(ctx.servicePriceCents + ctx.addonsCents, 25),
      explanation:
        'This appointment has already been rescheduled. Moving it again ' +
        'carries the same fee as a late cancellation.',
      freeReschedulesLeft: 0,
    };
  }

  if (hoursUntil < c.rescheduleMinimumNoticeHours) {
    const tier = [...c.feeTiers]
      .sort((a, b) => a.withinHours - b.withinHours)
      .find((t) => hoursUntil < t.withinHours);
    return {
      allowed: true,
      isFree: false,
      feeCents: tier
        ? percentOf(ctx.servicePriceCents + ctx.addonsCents, tier.feePercent)
        : 0,
      explanation: tier
        ? `Under ${c.rescheduleMinimumNoticeHours} hours notice, a ${tier.feePercent}% fee applies.`
        : null,
      freeReschedulesLeft,
    };
  }

  return {
    allowed: true,
    isFree: true,
    feeCents: 0,
    explanation: null,
    freeReschedulesLeft,
  };
}

/**
 * Booking restrictions earned by past behavior. Returned to the booking flow
 * so it can require a card, force prepayment, or send the client to the phone.
 */
export function bookingRestrictions(
  history: { noShowCount: number; lateCancelCount: number; hasCardOnFile: boolean },
  rules: AllRules
): {
  requiresCardOnFile: boolean;
  requiresFullPrepay: boolean;
  blockedFromOnlineBooking: boolean;
  reason: string | null;
} {
  const c = rules.cancellation;

  if (history.noShowCount >= c.prepayAfterNoShows) {
    return {
      requiresCardOnFile: true,
      requiresFullPrepay: true,
      blockedFromOnlineBooking: false,
      reason:
        'Because of previous missed appointments, online bookings are prepaid in full. ' +
        'Prepayment is fully refundable with adequate notice.',
    };
  }

  if (history.lateCancelCount >= c.requireCardAfterLateCancels) {
    return {
      requiresCardOnFile: true,
      requiresFullPrepay: false,
      blockedFromOnlineBooking: false,
      reason: 'A card on file is required to book online.',
    };
  }

  return {
    requiresCardOnFile: false,
    requiresFullPrepay: false,
    blockedFromOnlineBooking: false,
    reason: null,
  };
}
