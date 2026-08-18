/**
 * ============================================================================
 * PRICING & DEPOSITS
 * ============================================================================
 * One place that decides what a booking costs and what must be collected up
 * front. Both are levers on the numbers this platform manages:
 *
 *   - member pricing is what makes a membership worth buying (MRR)
 *   - deposits are the single most effective anti-no-show mechanism
 *   - add-on and upsell pricing is where average ticket moves
 *
 * Everything is integer cents. No floating point touches a price.
 * ============================================================================
 */

import { percentOf } from '@/lib/utils';
import type { AllRules } from '@/config/rules';

export interface PriceableService {
  id: string;
  name: string;
  price_cents: number;
  member_price_cents: number | null;
  duration_min: number;
  deposit_mode: 'none' | 'flat' | 'percent' | 'full';
  deposit_flat_cents: number;
  deposit_percent: number;
  taxable: boolean;
}

export interface PriceableAddon {
  id: string;
  name: string;
  price_cents: number;
  member_price_cents: number | null;
  duration_min: number;
  taxable: boolean;
  /** True when this add-on came from an upsell prompt, for attribution. */
  fromUpsell?: boolean;
}

export interface MemberContext {
  /** Percent off services not covered by an included credit. */
  discountPct: number;
  retailDiscountPct: number;
  waivesDeposits: boolean;
  /** Credits available to cover this visit outright. */
  creditsAvailable: number;
  /** Whether this service is eligible for credit redemption. */
  creditCoversService: boolean;
}

export interface ClientRiskContext {
  isNewClient: boolean;
  noShowRisk: number;
  noShowCount: number;
  lateCancelCount: number;
  hasCardOnFile: boolean;
}

export interface LineItem {
  kind: 'service' | 'addon' | 'product' | 'discount' | 'tax' | 'tip' | 'fee';
  referenceId: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  fromUpsell: boolean;
}

export interface PriceQuote {
  lines: LineItem[];
  /** Sum of service + add-ons at list price. */
  listSubtotalCents: number;
  /** What the client actually pays before tax. */
  subtotalCents: number;
  /** Total savings, for "you saved $X as a member" framing. */
  memberSavingsCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  /** Whole visit covered by a membership credit. */
  coveredByCredit: boolean;
  deposit: DepositDecision;
  /** Total appointment length including add-ons. */
  durationMin: number;
}

export interface DepositDecision {
  required: boolean;
  amountCents: number;
  /** Shown to the client so the ask never feels arbitrary. */
  reason: string | null;
  /** Machine-readable for reporting. */
  trigger:
    | 'none' | 'service_policy' | 'high_value' | 'long_duration'
    | 'new_client' | 'risk_score' | 'repeat_no_show' | 'full_prepay';
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

/**
 * Decide whether to hold a deposit, and how much.
 *
 * Ordering matters: the most serious trigger wins, because that is the reason
 * the client is shown. A client who has no-showed twice should be told they
 * are prepaying because of the no-shows, not because the service is expensive.
 */
export function decideDeposit(
  service: PriceableService,
  servicePriceCents: number,
  rules: AllRules,
  client: ClientRiskContext,
  member: MemberContext | null
): DepositDecision {
  const d = rules.deposits;
  if (!d.enabled) {
    return { required: false, amountCents: 0, reason: null, trigger: 'none' };
  }

  // Repeat no-shows: full prepayment, regardless of anything else.
  if (client.noShowCount >= rules.cancellation.prepayAfterNoShows) {
    return {
      required: true,
      amountCents: servicePriceCents,
      reason:
        `Because of ${client.noShowCount} missed appointments, this booking is prepaid in full. ` +
        `It is fully refundable with ${rules.cancellation.freeCancellationHours} hours notice.`,
      trigger: 'repeat_no_show',
    };
  }

  // Members are exempt below this line — a concrete, felt perk.
  if (member && (d.waiveForMembers || member.waivesDeposits)) {
    return { required: false, amountCents: 0, reason: null, trigger: 'none' };
  }

  const compute = (mode: string, flat: number, pct: number): number => {
    switch (mode) {
      case 'flat': return Math.min(flat, servicePriceCents);
      case 'percent': return percentOf(servicePriceCents, pct);
      case 'full': return servicePriceCents;
      default: return 0;
    }
  };

  // The service's own policy takes precedence over the global defaults.
  if (service.deposit_mode !== 'none') {
    const amount = compute(
      service.deposit_mode, service.deposit_flat_cents, service.deposit_percent
    );
    if (amount > 0) {
      return {
        required: true,
        amountCents: amount,
        reason: `A deposit is required to hold this appointment. It goes toward your total.`,
        trigger: service.deposit_mode === 'full' ? 'full_prepay' : 'service_policy',
      };
    }
  }

  const fallback = () => compute(d.defaultMode, d.defaultFlatCents, d.defaultPercent);

  if (client.noShowRisk >= d.requireAboveRiskScore) {
    return {
      required: true, amountCents: fallback(),
      reason: 'A deposit is required to hold this appointment. It goes toward your total.',
      trigger: 'risk_score',
    };
  }

  if (servicePriceCents >= d.requireAboveCents) {
    return {
      required: true, amountCents: fallback(),
      reason: 'This service reserves a long block of time, so we hold a deposit against it.',
      trigger: 'high_value',
    };
  }

  if (service.duration_min >= d.requireAboveMinutes) {
    return {
      required: true, amountCents: fallback(),
      reason: 'This service reserves a long block of time, so we hold a deposit against it.',
      trigger: 'long_duration',
    };
  }

  if (d.requireForNewClients && client.isNewClient) {
    return {
      required: true, amountCents: fallback(),
      reason: 'First-time bookings hold a small deposit, applied to your visit.',
      trigger: 'new_client',
    };
  }

  return { required: false, amountCents: 0, reason: null, trigger: 'none' };
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export interface QuoteInput {
  service: PriceableService;
  /** Slot-specific price, already multiplied by the provider's rate. */
  servicePriceCents?: number;
  addons: PriceableAddon[];
  products?: Array<{
    id: string; name: string; price_cents: number;
    member_price_cents: number | null; quantity: number; taxable: boolean;
  }>;
  member: MemberContext | null;
  client: ClientRiskContext;
  rules: AllRules;
  taxRateBps: number;
  /** A redeemed offer code, if any. */
  offer?: { kind: 'percent' | 'flat' | 'addon'; value: number; label: string } | null;
  /** Prepaid package session covering the service. */
  usePackageSession?: boolean;
  /** Redeem an included membership credit for the service. */
  useMembershipCredit?: boolean;
  tipCents?: number;
  giftCardCents?: number;
  accountCreditCents?: number;
}

export function quote(input: QuoteInput): PriceQuote {
  const {
    service, addons, products = [], member, client, rules, taxRateBps,
    offer, usePackageSession, useMembershipCredit, tipCents = 0,
  } = input;

  const lines: LineItem[] = [];
  let listSubtotal = 0;
  let subtotal = 0;
  let memberSavings = 0;
  let taxableBase = 0;
  let durationMin = service.duration_min;

  // --- Service ------------------------------------------------------------
  const listServicePrice = input.servicePriceCents ?? service.price_cents;

  const creditCovers =
    !!useMembershipCredit &&
    !!member &&
    member.creditsAvailable > 0 &&
    member.creditCoversService;

  const packageCovers = !!usePackageSession && !creditCovers;
  const coveredByCredit = creditCovers || packageCovers;

  let servicePrice: number;
  if (coveredByCredit) {
    servicePrice = 0;
    memberSavings += listServicePrice;
  } else if (member) {
    // An explicit member price on the service beats the plan's blanket percent.
    servicePrice =
      service.member_price_cents ??
      listServicePrice - percentOf(listServicePrice, member.discountPct);
    memberSavings += listServicePrice - servicePrice;
  } else {
    servicePrice = listServicePrice;
  }

  listSubtotal += listServicePrice;
  subtotal += servicePrice;
  if (service.taxable) taxableBase += servicePrice;

  lines.push({
    kind: 'service',
    referenceId: service.id,
    name: coveredByCredit
      ? `${service.name} (covered by your ${creditCovers ? 'membership' : 'package'})`
      : service.name,
    quantity: 1,
    unitPriceCents: servicePrice,
    totalCents: servicePrice,
    fromUpsell: false,
  });

  // --- Add-ons ------------------------------------------------------------
  for (const addon of addons) {
    const list = addon.price_cents;
    const price = member
      ? addon.member_price_cents ?? list - percentOf(list, member.discountPct)
      : list;

    if (member) memberSavings += list - price;
    listSubtotal += list;
    subtotal += price;
    durationMin += addon.duration_min;
    if (addon.taxable) taxableBase += price;

    lines.push({
      kind: 'addon',
      referenceId: addon.id,
      name: addon.name,
      quantity: 1,
      unitPriceCents: price,
      totalCents: price,
      fromUpsell: addon.fromUpsell ?? false,
    });
  }

  // --- Retail -------------------------------------------------------------
  for (const product of products) {
    const list = product.price_cents * product.quantity;
    const unit = member
      ? product.member_price_cents ??
        product.price_cents - percentOf(product.price_cents, member.retailDiscountPct)
      : product.price_cents;
    const total = unit * product.quantity;

    if (member) memberSavings += list - total;
    listSubtotal += list;
    subtotal += total;
    if (product.taxable) taxableBase += total;

    lines.push({
      kind: 'product',
      referenceId: product.id,
      name: product.name,
      quantity: product.quantity,
      unitPriceCents: unit,
      totalCents: total,
      fromUpsell: true,
    });
  }

  // --- Offers -------------------------------------------------------------
  let discountCents = 0;
  if (offer && !coveredByCredit) {
    if (offer.kind === 'percent') {
      discountCents = percentOf(subtotal, offer.value);
    } else if (offer.kind === 'flat') {
      discountCents = Math.min(offer.value, subtotal);
    }
    // An 'addon' offer is fulfilled by zero-pricing the add-on line, handled
    // by the caller when it builds the add-on list.

    if (discountCents > 0) {
      lines.push({
        kind: 'discount',
        referenceId: null,
        name: offer.label,
        quantity: 1,
        unitPriceCents: -discountCents,
        totalCents: -discountCents,
        fromUpsell: false,
      });
      subtotal -= discountCents;
      taxableBase = Math.max(taxableBase - discountCents, 0);
    }
  }

  // --- Tax ----------------------------------------------------------------
  const taxCents = Math.round((taxableBase * taxRateBps) / 10_000);
  if (taxCents > 0) {
    lines.push({
      kind: 'tax', referenceId: null, name: 'Tax',
      quantity: 1, unitPriceCents: taxCents, totalCents: taxCents, fromUpsell: false,
    });
  }

  if (tipCents > 0) {
    lines.push({
      kind: 'tip', referenceId: null, name: 'Tip',
      quantity: 1, unitPriceCents: tipCents, totalCents: tipCents, fromUpsell: false,
    });
  }

  const totalCents = Math.max(subtotal + taxCents + tipCents, 0);

  const deposit = decideDeposit(service, servicePrice, rules, client, member);

  return {
    lines,
    listSubtotalCents: listSubtotal,
    subtotalCents: subtotal,
    memberSavingsCents: memberSavings,
    discountCents,
    taxCents,
    totalCents,
    coveredByCredit,
    // Nothing to hold when the visit is already paid for.
    deposit: coveredByCredit
      ? { required: false, amountCents: 0, reason: null, trigger: 'none' }
      : deposit,
    durationMin,
  };
}

// ---------------------------------------------------------------------------
// Membership sales math
// ---------------------------------------------------------------------------

/**
 * Would this client be better off on a membership?
 *
 * The highest-converting membership pitch is not a feature list — it is
 * "here is what you already spent, and here is what you would have paid."
 * Returns null when the plan genuinely would not save them money; pitching
 * a bad deal costs more trust than the sale is worth.
 */
export function membershipSavingsPitch(opts: {
  spendLookbackDays: number;
  spendInPeriodCents: number;
  visitsInPeriod: number;
  plan: {
    name: string;
    price_cents: number;
    included_credits: number;
    discount_pct: number;
    billing_interval: string;
  };
}): {
  planName: string;
  periodMonths: number;
  actualSpendCents: number;
  wouldHavePaidCents: number;
  savingsCents: number;
  savingsPct: number;
} | null {
  const months = Math.max(opts.spendLookbackDays / 30, 1);
  const { plan } = opts;

  const planCostOverPeriod =
    plan.billing_interval === 'year'
      ? Math.round((plan.price_cents / 12) * months)
      : Math.round(plan.price_cents * months);

  const includedVisits = plan.included_credits * months;
  const avgVisitCents =
    opts.visitsInPeriod > 0 ? opts.spendInPeriodCents / opts.visitsInPeriod : 0;

  const paidVisits = Math.max(opts.visitsInPeriod - includedVisits, 0);
  const discountedVisitCost =
    paidVisits * avgVisitCents * (1 - plan.discount_pct / 100);

  const wouldHavePaid = Math.round(planCostOverPeriod + discountedVisitCost);
  const savings = opts.spendInPeriodCents - wouldHavePaid;

  if (savings <= 0) return null;

  return {
    planName: plan.name,
    periodMonths: Math.round(months),
    actualSpendCents: opts.spendInPeriodCents,
    wouldHavePaidCents: wouldHavePaid,
    savingsCents: savings,
    savingsPct: Math.round((savings / Math.max(opts.spendInPeriodCents, 1)) * 100),
  };
}
