/**
 * ============================================================================
 * FORK POINT #2 — BUSINESS RULES
 * ============================================================================
 * Every lever that moves the three numbers this platform exists to move:
 *
 *   1. MRR              → memberships, packages, auto-renew, save flows
 *   2. Cancellations    → deposits, policy tiers, reschedule-first, waitlist
 *   3. Average ticket   → add-on prompts, upsell rules, retail attach, tips
 *
 * These are defaults. Anything here can be overridden per-business at runtime
 * from the `businesses.policy` JSONB column (Settings → Policies in the admin
 * UI), so a client can tune without a redeploy. `loadRules()` in
 * `src/lib/rules.ts` merges DB overrides on top of this object.
 * ============================================================================
 */

import { vertical } from './verticals';

export interface BookingRules {
  /** Clients can book this far ahead. Longer = more banked revenue. */
  maxAdvanceBookingDays: number;
  /** Minimum lead time. 0 lets clients book the next open slot. */
  minLeadTimeMinutes: number;
  /** Granularity of the slot grid. 15 gives density; 30 is easier to read. */
  slotIntervalMinutes: number;
  /**
   * Let a second client be booked into a service's processing gap (hair color
   * develops, laser cools). Massive capacity unlock in color-heavy salons.
   */
  allowProcessingTimeOverlap: boolean;
  /** Padding after every appointment for cleanup/turnover. */
  defaultBufferAfterMinutes: number;
  defaultBufferBeforeMinutes: number;
  /** Cap how many future appointments one client can hold at once. */
  maxConcurrentFutureBookings: number;
  /** Require an account before booking. `false` = guest checkout, higher conversion. */
  requireAccountToBook: boolean;
  /** Show remaining-slot scarcity ("2 left today") on the picker. */
  showScarcityIndicators: boolean;
  /** Below this many open slots in a day, the scarcity badge appears. */
  scarcityThreshold: number;
}

export interface CancellationRules {
  /** Free-cancel window. Inside it, fees apply. */
  freeCancellationHours: number;
  /** Tiered fees. First matching tier (hours remaining <= `withinHours`) wins. */
  feeTiers: Array<{
    withinHours: number;
    /** Percentage of service price charged. */
    feePercent: number;
    label: string;
  }>;
  /** No-show fee as a percent of service price. */
  noShowFeePercent: number;
  /**
   * THE most important anti-cancellation setting. When a client clicks
   * "cancel", show reschedule options FIRST. A rescheduled appointment is
   * retained revenue; a cancelled one usually is not.
   */
  rescheduleFirst: boolean;
  /** Free reschedules allowed before it counts as a cancellation. */
  freeReschedulesPerAppointment: number;
  /** Reschedules inside this window still incur the tiered fee. */
  rescheduleMinimumNoticeHours: number;
  /** Auto-release the slot to the waitlist the moment a cancel lands. */
  autoOfferToWaitlist: boolean;
  /** Waitlist claimants get this long to confirm before the offer rotates. */
  waitlistClaimWindowMinutes: number;
  /** After N no-shows the client must prepay in full to book. */
  prepayAfterNoShows: number;
  /** After N late cancels a card on file becomes mandatory. */
  requireCardAfterLateCancels: number;
}

export interface DepositRules {
  enabled: boolean;
  /** 'none' | 'flat' | 'percent' | 'full' */
  defaultMode: 'none' | 'flat' | 'percent' | 'full';
  defaultFlatCents: number;
  defaultPercent: number;
  /** Services at or above this price always take a deposit. */
  requireAboveCents: number;
  /** Services at or above this duration always take a deposit. */
  requireAboveMinutes: number;
  /** New clients (zero completed visits) always take a deposit. */
  requireForNewClients: boolean;
  /** Risk score at/above which a deposit is forced regardless of service. */
  requireAboveRiskScore: number;
  /** Members skip deposits — a concrete perk that helps sell memberships. */
  waiveForMembers: boolean;
}

export interface ReminderRules {
  /** Hours before the appointment to send each reminder. Descending. */
  scheduleHoursBefore: number[];
  /** Channel priority. Falls through if a client hasn't opted into the first. */
  channelPriority: Array<'sms' | 'email' | 'push'>;
  /** Require an explicit "C to confirm" tap. Confirmed appointments no-show far less. */
  requireConfirmation: boolean;
  /** Unconfirmed this many hours out → release the slot to the waitlist. */
  releaseUnconfirmedAfterHours: number | null;
  /** Never send outside these local hours. */
  quietHours: { start: string; end: string };
}

export interface RebookingRules {
  /**
   * THE core mechanic. After checkout, immediately prompt for the next visit
   * with a pre-selected date at the service's ideal interval. Businesses that
   * rebook at the chair run 2-3x the retention of those that don't.
   */
  promptAtCheckout: boolean;
  /** Also prompt in the confirmation email/SMS after the visit. */
  promptInFollowUp: boolean;
  /** Hours after visit completion to send the follow-up rebooking nudge. */
  followUpDelayHours: number;
  /** Escalating nudges at these day-offsets past the ideal rebook date. */
  nudgeDayOffsets: number[];
  /** Default interval when a service doesn't define its own. */
  defaultIntervalDays: number;
  /** Offer a small incentive to book the next visit on the spot. */
  incentive: {
    enabled: boolean;
    /** 'percent' | 'flat' | 'addon' — an add-on costs less margin than a discount. */
    kind: 'percent' | 'flat' | 'addon';
    value: number;
    label: string;
  };
  /** Show "your usual stylist, your usual time" one-tap rebooking. */
  offerUsualSlot: boolean;
}

export interface LapseRules {
  /**
   * A client is "due" at last_visit + their personal average interval, and
   * "lapsed" at that interval x lapseMultiplier. Personal cadence beats a
   * global 90-day rule — a 2-week nail client is lapsed long before a
   * twice-a-year dental patient.
   */
  usePersonalCadence: boolean;
  /** Fallback interval when a client has fewer than 2 visits. */
  fallbackIntervalDays: number;
  lapseMultiplier: number;
  /** Days past lapse before winback escalates to the best offer. */
  winbackEscalationDays: number[];
  /** Stop paying to chase after this many days. */
  giveUpAfterDays: number;
  /** Winback offers, escalating in cost. Cheapest first. */
  winbackOffers: Array<{ afterDays: number; kind: 'percent' | 'flat' | 'addon'; value: number; label: string }>;
}

export interface MembershipRules {
  enabled: boolean;
  /** Unused monthly credits roll forward this many periods. 0 = use it or lose it. */
  creditRolloverPeriods: number;
  /** Hard ceiling on banked credits so liability stays bounded. */
  maxBankedCredits: number;
  /** Let members pause instead of cancel. The single best churn saver. */
  allowPause: boolean;
  maxPauseMonths: number;
  pausesPerYear: number;
  /** Minimum committed months before cancellation is allowed. 0 = month-to-month. */
  commitmentMonths: number;
  /** Show a save offer when a member starts a cancellation. */
  saveFlow: {
    enabled: boolean;
    /** Ordered offers. The member sees them one at a time. */
    offers: Array<{
      kind: 'pause' | 'downgrade' | 'discount' | 'free_month' | 'extra_credit';
      label: string;
      description: string;
      value?: number;
    }>;
  };
  /** Failed payment recovery before the membership is cancelled. */
  dunning: {
    retryDayOffsets: number[];
    /** Grace period during which benefits still apply. */
    graceDays: number;
    /** Pause instead of cancelling when dunning is exhausted — easier to revive. */
    pauseOnFailure: boolean;
  };
  /** Prompt non-members whose spend exceeds the plan price. Highest-converting pitch there is. */
  promptWhenSpendExceedsPlan: boolean;
  /** Look back this far when computing that spend. */
  spendLookbackDays: number;
}

export interface UpsellRules {
  enabled: boolean;
  /** Max add-ons surfaced during booking. More than 3 tanks conversion. */
  maxAddonsShownAtBooking: number;
  /** Show add-ons again at check-out (front desk view). */
  promptAtCheckout: boolean;
  /** Suggest retail products tied to the service performed. */
  retailAttachPrompt: boolean;
  /** Tip prompt defaults. Anchoring high raises average tip meaningfully. */
  tipPresets: number[];
  tipDefaultIndex: number;
  /** Suggest a package when a client's visit count crosses this threshold. */
  packagePromptAfterVisits: number;
  /** Suggest upgrading to the longer/premium version of a booked service. */
  serviceUpgradePrompt: boolean;
}

export interface LoyaltyRules {
  enabled: boolean;
  /** Points earned per dollar spent. */
  pointsPerDollar: number;
  /** Points required per dollar of redemption value. */
  pointsPerDollarRedeemed: number;
  /** Bonus points for behaviors you want more of. */
  bonuses: {
    rebookAtCheckout: number;
    reviewSubmitted: number;
    referralConverted: number;
    membershipSignup: number;
    /** Per consecutive month with at least one visit. */
    visitStreakMonth: number;
  };
  /** Points expire after this many days of inactivity. 0 = never. */
  expiryDays: number;
  tiers: Array<{ name: string; minAnnualSpendCents: number; perks: string[] }>;
}

export interface ReferralRules {
  enabled: boolean;
  /** Credit to the referrer once the referee completes a first visit. */
  referrerRewardCents: number;
  /** Discount for the new client's first visit. */
  refereeRewardCents: number;
  /** Referrer must have this many completed visits to refer. */
  minVisitsToRefer: number;
  /** Cap rewards per referrer per year. */
  maxRewardsPerYear: number;
}

export interface FirstVisitRules {
  enabled: boolean;
  /**
   * The stages, in order. Each fires once, `afterHours` after the first visit
   * completed, and dedupes on its own key — so the job is safe to re-run and
   * safe to run late.
   *
   * `relativeToInterval` shifts a stage to sit relative to the service's own
   * rebook interval instead of the visit: -168 means "a week before they are
   * due back", which is where the offer belongs whether that is three weeks
   * out or twelve.
   */
  stages: Array<{
    key: string;
    /** Hours after the first visit. Ignored when relativeToInterval is set. */
    afterHours?: number;
    /** Hours either side of the due date. Negative is before. */
    relativeToInterval?: number;
    /** What this message is for, in the campaign list and the send log. */
    label: string;
  }>;
  /**
   * Days after the first visit during which the generic rebooking nudge and
   * the winback both stand down. Without this a new client gets the sequence
   * and the ordinary campaigns at once, and the mailbox reads as a machine.
   */
  exclusiveForDays: number;
}

export interface ReviewRules {
  enabled: boolean;
  /** Hours after a completed visit to request a review. */
  requestDelayHours: number;
  /**
   * Screen clients with a private rating and only send high scorers to the
   * public review link.
   *
   * DO NOT TURN THIS ON. It is review gating, and it is against policy on
   * every platform that matters:
   *
   *   Google's Contributed Content Policy forbids selectively soliciting
   *   positive reviews. Gated reviews get removed, and repeat violations can
   *   suspend the Business Profile outright — Google now detects the pattern
   *   automatically and has begun targeting the software that enables it.
   *
   *   In the US it is also an FTC matter. Fashion Nova paid $4.2m for
   *   suppressing negative reviews.
   *
   * The flag exists because the behaviour is common enough that someone will
   * look for it, and finding it documented here is better than finding it
   * reimplemented badly. Leave it false.
   *
   * The compliant version of the same idea is `privateFeedbackUrl` below:
   * ask everyone for a public review, and offer everyone a private channel
   * too. What breaks the rule is conditioning the public ask on the score.
   */
  gateByRating: boolean;
  publicThreshold: number;
  /** Public review link — sent to every client, not a filtered subset. */
  publicReviewUrl: string;
  /**
   * Offered alongside the public link, to everyone. This is how an unhappy
   * client reaches the owner directly without the ask being gated.
   */
  privateFeedbackUrl: string;
  /** Don't re-ask a client more often than this. */
  cooldownDays: number;
}

export interface AllRules {
  booking: BookingRules;
  cancellation: CancellationRules;
  deposits: DepositRules;
  reminders: ReminderRules;
  rebooking: RebookingRules;
  lapse: LapseRules;
  memberships: MembershipRules;
  upsell: UpsellRules;
  loyalty: LoyaltyRules;
  referrals: ReferralRules;
  reviews: ReviewRules;
  firstVisit: FirstVisitRules;
}

export const rules: AllRules = {
  booking: {
    maxAdvanceBookingDays: 120,
    minLeadTimeMinutes: 60,
    slotIntervalMinutes: 15,
    allowProcessingTimeOverlap: true,
    defaultBufferAfterMinutes: 10,
    defaultBufferBeforeMinutes: 0,
    maxConcurrentFutureBookings: 6,
    requireAccountToBook: false,
    showScarcityIndicators: true,
    scarcityThreshold: 3,
  },

  cancellation: {
    freeCancellationHours: 24,
    feeTiers: [
      { withinHours: 2, feePercent: 100, label: 'Less than 2 hours notice' },
      { withinHours: 12, feePercent: 50, label: 'Less than 12 hours notice' },
      { withinHours: 24, feePercent: 25, label: 'Less than 24 hours notice' },
    ],
    noShowFeePercent: 100,
    rescheduleFirst: true,
    freeReschedulesPerAppointment: 1,
    rescheduleMinimumNoticeHours: 12,
    autoOfferToWaitlist: true,
    waitlistClaimWindowMinutes: 30,
    prepayAfterNoShows: 2,
    requireCardAfterLateCancels: 2,
  },

  deposits: {
    enabled: true,
    defaultMode: 'percent',
    defaultFlatCents: 2500,
    defaultPercent: 25,
    requireAboveCents: 15000,
    requireAboveMinutes: 90,
    requireForNewClients: true,
    requireAboveRiskScore: 60,
    waiveForMembers: true,
  },

  reminders: {
    scheduleHoursBefore: [72, 24, 3],
    channelPriority: ['sms', 'email'],
    requireConfirmation: true,
    releaseUnconfirmedAfterHours: null,
    quietHours: { start: '21:00', end: '08:00' },
  },

  rebooking: {
    promptAtCheckout: true,
    promptInFollowUp: true,
    followUpDelayHours: 20,
    nudgeDayOffsets: [0, 5, 14],
    defaultIntervalDays: vertical.rebookIntervalDays,
    incentive: {
      enabled: true,
      kind: 'addon',
      value: 0,
      label: 'Book before you leave and your next add-on is on us',
    },
    offerUsualSlot: true,
  },

  lapse: {
    usePersonalCadence: true,
    fallbackIntervalDays: vertical.rebookIntervalDays,
    lapseMultiplier: vertical.lapseMultiplier,
    winbackEscalationDays: [7, 30, 90],
    giveUpAfterDays: 365,
    winbackOffers: [
      { afterDays: 7, kind: 'addon', value: 0, label: 'A complimentary add-on on your next visit' },
      { afterDays: 30, kind: 'percent', value: 15, label: '15% off your next visit' },
      { afterDays: 90, kind: 'percent', value: 25, label: "25% off — we'd love to see you again" },
    ],
  },

  memberships: {
    enabled: true,
    creditRolloverPeriods: 3,
    maxBankedCredits: 6,
    allowPause: true,
    maxPauseMonths: 3,
    pausesPerYear: 2,
    commitmentMonths: 0,
    saveFlow: {
      enabled: true,
      offers: [
        { kind: 'pause', label: 'Pause instead', description: 'Freeze your membership for up to 3 months. Your credits and rate are held.', value: 3 },
        { kind: 'downgrade', label: 'Switch to a smaller plan', description: 'Keep your member pricing at a lower monthly commitment.' },
        { kind: 'discount', label: 'Take 50% off for 2 months', description: 'Stay with us at half price while you decide.', value: 50 },
        { kind: 'free_month', label: 'One month on us', description: 'Your next month is free. Cancel any time after.' },
      ],
    },
    dunning: {
      retryDayOffsets: [1, 3, 5, 7],
      graceDays: 7,
      pauseOnFailure: true,
    },
    promptWhenSpendExceedsPlan: true,
    spendLookbackDays: 90,
  },

  upsell: {
    enabled: true,
    maxAddonsShownAtBooking: 3,
    promptAtCheckout: true,
    retailAttachPrompt: true,
    tipPresets: [18, 20, 25, 30],
    tipDefaultIndex: 1,
    packagePromptAfterVisits: 3,
    serviceUpgradePrompt: true,
  },

  loyalty: {
    enabled: true,
    pointsPerDollar: 1,
    pointsPerDollarRedeemed: 20,
    bonuses: {
      rebookAtCheckout: 50,
      reviewSubmitted: 100,
      referralConverted: 500,
      membershipSignup: 250,
      visitStreakMonth: 25,
    },
    expiryDays: 365,
    tiers: [
      { name: 'Member', minAnnualSpendCents: 0, perks: ['Earn points on every visit'] },
      { name: 'Silver', minAnnualSpendCents: 50000, perks: ['Early access to new services', 'Birthday add-on'] },
      { name: 'Gold', minAnnualSpendCents: 120000, perks: ['Priority booking', 'Free add-on quarterly', '10% off retail'] },
      { name: 'Platinum', minAnnualSpendCents: 250000, perks: ['Dedicated booking line', 'Waived deposits', '15% off retail'] },
    ],
  },

  referrals: {
    enabled: true,
    referrerRewardCents: 2500,
    refereeRewardCents: 2500,
    minVisitsToRefer: 1,
    maxRewardsPerYear: 10,
  },

  /**
   * The first-visit sequence.
   *
   * Whether a new client returns a second time is where retention is actually
   * decided: first-visit clients come back at roughly half the rate of anyone
   * who has been twice. One follow-up email does not move that. Four messages,
   * each doing a different job, is what the spread is worth spending.
   *
   * The check-in on day three is the one people skip and the one that matters
   * most — most first-visit churn is an unvoiced small dissatisfaction, and a
   * client who tells you about it is a client you can still keep.
   */
  firstVisit: {
    enabled: true,
    stages: [
      { key: 'thanks',   afterHours: 2,    label: 'Thank you and aftercare' },
      { key: 'checkin',  afterHours: 72,   label: 'How is it settling?' },
      { key: 'rebook',   relativeToInterval: -168, label: 'Book your next one' },
      { key: 'lastcall', relativeToInterval: 240,  label: 'One more nudge' },
    ],
    exclusiveForDays: 120,
  },

  reviews: {
    enabled: true,
    requestDelayHours: 24,
    // Off, and it should stay off. See the note on the type above.
    gateByRating: false,
    publicThreshold: 4,
    publicReviewUrl: 'https://example.test/review-us',
    privateFeedbackUrl: 'https://example.test/feedback',
    cooldownDays: 90,
  },
};
