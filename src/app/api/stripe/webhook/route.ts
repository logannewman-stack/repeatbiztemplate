import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/retention/dispatch';
import { generateCode } from '@/lib/utils';

/**
 * ============================================================================
 * STRIPE WEBHOOK
 * ============================================================================
 * The only place a purchase is treated as complete. Success redirects are not
 * trusted: a client can close the tab before it fires, and a redirect URL can
 * be forged. Everything that grants value — credits, packages, gift cards,
 * membership status — happens here.
 *
 * Every event is recorded in `webhook_events` before it is processed, so a
 * redelivery is a no-op rather than a second grant.
 * ============================================================================
 */

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Idempotency gate. A unique violation means we have already handled this.
  const { error: claimError } = await supabase
    .from('webhook_events')
    .insert({ id: event.id, provider: 'stripe', type: event.type });

  if (claimError) {
    if (claimError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ error: 'Could not record event.' }, { status: 500 });
  }

  try {
    await handleEvent(event);
    await supabase
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('webhook_events').update({ error: message }).eq('id', event.id);
    // 500 asks Stripe to retry, which is what we want for a transient failure.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return handleSubscriptionChange(event.data.object as Stripe.Subscription);

    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription);

    case 'invoice.paid':
      return handleInvoicePaid(event.data.object as Stripe.Invoice);

    case 'invoice.payment_failed':
      return handleInvoiceFailed(event.data.object as Stripe.Invoice);

    case 'charge.refunded':
      return handleRefund(event.data.object as Stripe.Charge);

    default:
      // Unhandled event types are recorded and acknowledged, not errors.
      return;
  }
}

// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const meta = session.metadata ?? {};

  switch (meta.purpose) {
    case 'deposit': {
      if (!meta.appointment_id) return;
      await supabase
        .from('appointments')
        .update({
          deposit_paid_at: new Date().toISOString(),
          deposit_payment_intent_id:
            typeof session.payment_intent === 'string' ? session.payment_intent : null,
        })
        .eq('id', meta.appointment_id);

      await supabase.from('payments').insert({
        business_id: meta.business_id,
        client_id: meta.client_id,
        appointment_id: meta.appointment_id,
        amount_cents: session.amount_total ?? 0,
        currency: (session.currency ?? 'usd').toUpperCase(),
        status: 'succeeded',
        method: 'card',
        purpose: 'deposit',
        stripe_payment_intent_id:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
        processed_at: new Date().toISOString(),
      });
      return;
    }

    case 'package': {
      if (!meta.package_id || !meta.client_id) return;

      const { data: pkg } = await supabase
        .from('packages')
        .select('*')
        .eq('id', meta.package_id)
        .single();
      if (!pkg) return;

      await supabase.from('client_packages').insert({
        business_id: pkg.business_id,
        client_id: meta.client_id,
        package_id: pkg.id,
        name_snapshot: pkg.name,
        total_quantity: pkg.quantity,
        remaining_quantity: pkg.quantity,
        price_paid_cents: session.amount_total ?? pkg.price_cents,
        expires_at: pkg.expires_days
          ? new Date(Date.now() + pkg.expires_days * 86_400_000).toISOString()
          : null,
      });
      return;
    }

    case 'gift_card': {
      const amount = Number(meta.amount_cents || session.amount_total || 0);
      if (!amount || !meta.business_id) return;

      await supabase.from('gift_cards').insert({
        business_id: meta.business_id,
        code: generateCode('GC', 10),
        initial_cents: amount,
        balance_cents: amount,
        purchaser_client_id: meta.purchaser_client_id || null,
        recipient_name: meta.recipient_name || null,
        recipient_email: meta.recipient_email || null,
        message: meta.message || null,
        deliver_at: meta.deliver_at || null,
      });
      return;
    }

    default:
      // Subscriptions are handled by the subscription events instead, which
      // carry the period boundaries this one does not.
      return;
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const supabase = createAdminClient();
  const meta = subscription.metadata ?? {};

  const statusMap: Record<string, string> = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    unpaid: 'past_due',
    canceled: 'cancelled',
    incomplete: 'past_due',
    incomplete_expired: 'cancelled',
    paused: 'paused',
  };

  const status = subscription.pause_collection
    ? 'paused'
    : statusMap[subscription.status] ?? 'active';

  // On this API version the billing period lives on the subscription itself.
  // A later version moves it onto each subscription item; if you bump the
  // pinned apiVersion in src/lib/stripe/client.ts, read it from
  // `subscription.items.data[0]` instead.
  const periodStart = subscription.current_period_start;
  const periodEnd = subscription.current_period_end;

  const { data: existing } = await supabase
    .from('memberships')
    .select('id, plan_id, current_period_start, credits_balance')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();

  const payload = {
    status: status as never,
    stripe_subscription_id: subscription.id,
    stripe_customer_id:
      typeof subscription.customer === 'string' ? subscription.customer : null,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };

  if (existing) {
    await supabase.from('memberships').update(payload).eq('id', existing.id);

    // A new billing period means a fresh grant of included credits. Comparing
    // period starts is what keeps a mid-period `subscription.updated` — a card
    // change, a metadata edit — from granting a second month of credits.
    const newPeriod =
      periodStart &&
      existing.current_period_start &&
      new Date(periodStart * 1000).toISOString() !== existing.current_period_start;

    if (newPeriod && status === 'active') {
      const { data: plan } = await supabase
        .from('membership_plans')
        .select('included_credits')
        .eq('id', existing.plan_id)
        .single();

      if (plan?.included_credits) {
        await supabase.rpc('grant_membership_credits', {
          p_membership_id: existing.id,
          p_amount: plan.included_credits,
          p_reason: 'period_grant',
        });
      }
    }
    return;
  }

  // First time we've seen this subscription — create the membership.
  if (!meta.client_id || !meta.plan_id || !meta.business_id) return;

  const { data: created } = await supabase
    .from('memberships')
    .insert({
      business_id: meta.business_id,
      client_id: meta.client_id,
      plan_id: meta.plan_id,
      ...payload,
    })
    .select('id')
    .single();

  if (!created) return;

  const { data: plan } = await supabase
    .from('membership_plans')
    .select('included_credits, commitment_months')
    .eq('id', meta.plan_id)
    .single();

  if (plan?.included_credits) {
    await supabase.rpc('grant_membership_credits', {
      p_membership_id: created.id,
      p_amount: plan.included_credits,
      p_reason: 'period_grant',
    });
  }

  if (plan?.commitment_months) {
    const commitmentEnd = new Date();
    commitmentEnd.setMonth(commitmentEnd.getMonth() + plan.commitment_months);
    await supabase
      .from('memberships')
      .update({ commitment_ends_at: commitmentEnd.toISOString() })
      .eq('id', created.id);
  }

  await dispatch({
    businessId: meta.business_id,
    campaignKey: 'membership_welcome',
    clientId: meta.client_id,
    occurrence: created.id,
    membershipId: created.id,
    transactional: true,
  }).catch(() => {
    // A missing welcome campaign must not fail the webhook — the membership
    // is real either way, and Stripe would retry the whole event.
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = createAdminClient();
  await supabase
    .from('memberships')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      credits_balance: 0,
    })
    .eq('stripe_subscription_id', subscription.id);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const supabase = createAdminClient();
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;

  const { data: membership } = await supabase
    .from('memberships')
    .select('id, business_id, client_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!membership) return;

  // A successful charge clears any dunning state.
  await supabase
    .from('memberships')
    .update({
      status: 'active',
      past_due_since: null,
      dunning_attempts: 0,
      last_payment_failed_at: null,
    })
    .eq('id', membership.id);

  await supabase.from('payments').insert({
    business_id: membership.business_id,
    client_id: membership.client_id,
    membership_id: membership.id,
    amount_cents: invoice.amount_paid,
    currency: invoice.currency.toUpperCase(),
    status: 'succeeded',
    method: 'card',
    purpose: 'subscription',
    stripe_invoice_id: invoice.id,
    processed_at: new Date().toISOString(),
  });
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const supabase = createAdminClient();
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;

  const { data: membership } = await supabase
    .from('memberships')
    .select('id, business_id, client_id, dunning_attempts, past_due_since')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!membership) return;

  await supabase
    .from('memberships')
    .update({
      status: 'past_due',
      past_due_since: membership.past_due_since ?? new Date().toISOString(),
      dunning_attempts: membership.dunning_attempts + 1,
      last_payment_failed_at: new Date().toISOString(),
    })
    .eq('id', membership.id);

  // Most involuntary churn is an expired card, not a decision. Telling the
  // member promptly recovers a large share of it.
  await dispatch({
    businessId: membership.business_id,
    campaignKey: 'membership_dunning',
    clientId: membership.client_id,
    occurrence: `${membership.id}:${invoice.id}`,
    membershipId: membership.id,
    transactional: true,
  }).catch(() => {});
}

async function handleRefund(charge: Stripe.Charge) {
  const supabase = createAdminClient();
  if (!charge.payment_intent) return;

  const intentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent.id;

  await supabase
    .from('payments')
    .update({
      refunded_cents: charge.amount_refunded,
      status: charge.amount_refunded >= charge.amount ? 'refunded' : 'succeeded',
    })
    .eq('stripe_payment_intent_id', intentId);
}
