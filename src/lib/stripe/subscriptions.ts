/**
 * ============================================================================
 * SUBSCRIPTIONS — the MRR engine
 * ============================================================================
 * Memberships are where predictable revenue comes from, so the interesting
 * code here is not the signup — it is everything that happens when a member
 * tries to leave.
 *
 * The order of preference when someone wants out:
 *   1. Pause      — keeps the relationship and the rate; easiest to revive
 *   2. Downgrade  — keeps some MRR and all of the habit
 *   3. Discount   — costs margin but keeps the subscription alive
 *   4. Cancel at period end — they keep what they paid for
 *
 * A hard immediate cancellation is offered only when someone insists, because
 * refunding a partial month buys nothing and forfeiting it earns a chargeback.
 * ============================================================================
 */

import { getStripe } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AllRules } from '@/config/rules';
import type { Membership, MembershipPlan } from '@/types/database';

export interface SaveOffer {
  kind: 'pause' | 'downgrade' | 'discount' | 'free_month' | 'extra_credit';
  label: string;
  description: string;
  value?: number;
  /** False when the member has exhausted this offer's limits. */
  available: boolean;
  unavailableReason?: string;
}

/**
 * Which save offers this member can actually be shown.
 *
 * Offers already declined are filtered out — re-showing a rejected offer reads
 * as a business that isn't listening, and it does not convert twice.
 */
export function availableSaveOffers(
  membership: Pick<
    Membership, 'pauses_used_this_year' | 'save_offers_shown' | 'plan_id' | 'started_at'
  >,
  plan: Pick<MembershipPlan, 'allow_pause' | 'price_cents' | 'commitment_months'>,
  otherPlans: Array<Pick<MembershipPlan, 'id' | 'name' | 'price_cents'>>,
  rules: AllRules
): SaveOffer[] {
  const m = rules.memberships;
  if (!m.saveFlow.enabled) return [];

  const shown = new Set(membership.save_offers_shown ?? []);

  return m.saveFlow.offers
    .map<SaveOffer>((offer) => {
      switch (offer.kind) {
        case 'pause': {
          const allowed = plan.allow_pause && m.allowPause;
          const used = membership.pauses_used_this_year >= m.pausesPerYear;
          return {
            ...offer,
            available: allowed && !used,
            unavailableReason: !allowed
              ? 'Pausing is not available on this plan.'
              : used
                ? 'You have already used your pauses for this year.'
                : undefined,
          };
        }
        case 'downgrade': {
          const cheaper = otherPlans.filter((p) => p.price_cents < plan.price_cents);
          return {
            ...offer,
            available: cheaper.length > 0,
            unavailableReason: cheaper.length
              ? undefined
              : 'This is already our smallest plan.',
          };
        }
        default:
          return { ...offer, available: true };
      }
    })
    // Never re-pitch something they already turned down.
    .filter((offer) => !shown.has(offer.kind))
    .filter((offer) => offer.available);
}

/**
 * Pause a membership.
 *
 * Stripe's `pause_collection` keeps the subscription alive but stops billing,
 * which is exactly right: the member keeps their record, their rate, and their
 * banked credits, and resuming is one click instead of a fresh signup.
 */
export async function pauseMembership(
  membershipId: string,
  months: number,
  rules: AllRules
): Promise<{ resumesAt: Date }> {
  const supabase = createAdminClient();

  const { data: membership, error } = await supabase
    .from('memberships')
    .select('id, stripe_subscription_id, pauses_used_this_year, status')
    .eq('id', membershipId)
    .single();

  if (error || !membership) throw new Error('Membership not found.');
  if (membership.pauses_used_this_year >= rules.memberships.pausesPerYear) {
    throw new Error('No pauses remaining this year.');
  }

  const cappedMonths = Math.min(months, rules.memberships.maxPauseMonths);
  const resumesAt = new Date();
  resumesAt.setMonth(resumesAt.getMonth() + cappedMonths);

  if (membership.stripe_subscription_id) {
    const stripe = getStripe();
    await stripe.subscriptions.update(membership.stripe_subscription_id, {
      pause_collection: {
        behavior: 'void',
        resumes_at: Math.floor(resumesAt.getTime() / 1000),
      },
      // Pausing supersedes any pending cancellation.
      cancel_at_period_end: false,
    });
  }

  await supabase
    .from('memberships')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      paused_until: resumesAt.toISOString(),
      pauses_used_this_year: membership.pauses_used_this_year + 1,
      cancel_at_period_end: false,
      cancellation_requested_at: null,
      save_offer_accepted: 'pause',
    })
    .eq('id', membershipId);

  return { resumesAt };
}

export async function resumeMembership(membershipId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: membership } = await supabase
    .from('memberships')
    .select('id, stripe_subscription_id')
    .eq('id', membershipId)
    .single();

  if (!membership) throw new Error('Membership not found.');

  if (membership.stripe_subscription_id) {
    const stripe = getStripe();
    await stripe.subscriptions.update(membership.stripe_subscription_id, {
      pause_collection: null,
    });
  }

  await supabase
    .from('memberships')
    .update({
      status: 'active', paused_at: null, paused_until: null,
    })
    .eq('id', membershipId);
}

/** Move a member to a different plan, prorating the difference. */
export async function changeMembershipPlan(
  membershipId: string,
  newPlanId: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data: membership } = await supabase
    .from('memberships')
    .select('id, stripe_subscription_id')
    .eq('id', membershipId)
    .single();
  const { data: newPlan } = await supabase
    .from('membership_plans')
    .select('id, stripe_price_id, included_credits')
    .eq('id', newPlanId)
    .single();

  if (!membership || !newPlan) throw new Error('Membership or plan not found.');

  if (membership.stripe_subscription_id && newPlan.stripe_price_id) {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(membership.stripe_subscription_id);
    await stripe.subscriptions.update(membership.stripe_subscription_id, {
      items: [{ id: sub.items.data[0].id, price: newPlan.stripe_price_id }],
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
    });
  }

  await supabase
    .from('memberships')
    .update({
      plan_id: newPlanId,
      cancel_at_period_end: false,
      cancellation_requested_at: null,
      save_offer_accepted: 'downgrade',
    })
    .eq('id', membershipId);
}

/** Apply a temporary discount to keep a member who was about to leave. */
export async function applySaveDiscount(
  membershipId: string,
  percentOff: number,
  durationMonths: number
): Promise<void> {
  const supabase = createAdminClient();

  const { data: membership } = await supabase
    .from('memberships')
    .select('id, stripe_subscription_id')
    .eq('id', membershipId)
    .single();

  if (!membership?.stripe_subscription_id) {
    throw new Error('Membership has no Stripe subscription.');
  }

  const stripe = getStripe();
  const coupon = await stripe.coupons.create({
    percent_off: percentOff,
    duration: 'repeating',
    duration_in_months: durationMonths,
    name: `Retention offer — ${percentOff}% off`,
  });

  await stripe.subscriptions.update(membership.stripe_subscription_id, {
    discounts: [{ coupon: coupon.id }],
    cancel_at_period_end: false,
  });

  await supabase
    .from('memberships')
    .update({
      cancel_at_period_end: false,
      cancellation_requested_at: null,
      save_offer_accepted: 'discount',
    })
    .eq('id', membershipId);
}

/**
 * Cancel a membership.
 *
 * `immediate` is deliberately opt-in and rare. Cancelling at period end means
 * the member keeps what they already paid for, which is both fairer and
 * measurably less likely to end in a dispute.
 */
export async function cancelMembership(
  membershipId: string,
  opts: { reason?: string; immediate?: boolean } = {}
): Promise<{ endsAt: string | null }> {
  const supabase = createAdminClient();

  const { data: membership } = await supabase
    .from('memberships')
    .select('id, stripe_subscription_id, current_period_end')
    .eq('id', membershipId)
    .single();

  if (!membership) throw new Error('Membership not found.');

  if (membership.stripe_subscription_id) {
    const stripe = getStripe();
    if (opts.immediate) {
      await stripe.subscriptions.cancel(membership.stripe_subscription_id);
    } else {
      await stripe.subscriptions.update(membership.stripe_subscription_id, {
        cancel_at_period_end: true,
        cancellation_details: { comment: opts.reason ?? undefined },
      });
    }
  }

  await supabase
    .from('memberships')
    .update(
      opts.immediate
        ? {
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancellation_reason: opts.reason ?? null,
          }
        : {
            status: 'cancelling',
            cancel_at_period_end: true,
            cancellation_requested_at: new Date().toISOString(),
            cancellation_reason: opts.reason ?? null,
          }
    )
    .eq('id', membershipId);

  return { endsAt: opts.immediate ? null : membership.current_period_end };
}

/** Record that an offer was shown, so it is not pitched twice. */
export async function recordSaveOfferShown(
  membershipId: string,
  offerKind: string
): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('memberships')
    .select('save_offers_shown')
    .eq('id', membershipId)
    .single();

  const shown = new Set(data?.save_offers_shown ?? []);
  shown.add(offerKind);

  await supabase
    .from('memberships')
    .update({ save_offers_shown: [...shown] })
    .eq('id', membershipId);
}

/**
 * Create the Stripe Product and Price for a plan defined in the admin UI.
 * Idempotent: an existing price id is returned untouched, because changing a
 * price in place would silently re-bill existing members at the new rate.
 */
export async function syncPlanToStripe(planId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: plan } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (!plan) throw new Error('Plan not found.');
  if (plan.stripe_price_id) return plan.stripe_price_id;

  const stripe = getStripe();

  const product = plan.stripe_product_id
    ? await stripe.products.retrieve(plan.stripe_product_id)
    : await stripe.products.create({
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { plan_id: plan.id, business_id: plan.business_id },
      });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.price_cents,
    currency: 'usd',
    recurring: {
      interval: plan.billing_interval === 'year' ? 'year' : 'month',
      interval_count: plan.interval_count,
    },
    metadata: { plan_id: plan.id },
  });

  await supabase
    .from('membership_plans')
    .update({ stripe_product_id: product.id, stripe_price_id: price.id })
    .eq('id', planId);

  return price.id;
}
