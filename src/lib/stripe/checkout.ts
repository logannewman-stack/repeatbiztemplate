import { getStripe } from './client';
import type Stripe from 'stripe';

/**
 * ============================================================================
 * CHECKOUT
 * ============================================================================
 * Four things get sold through Stripe Checkout:
 *
 *   deposit     — holds an appointment; applied to the final ticket
 *   membership  — recurring, the MRR line
 *   package     — prepaid block of visits, cash up front
 *   gift_card   — sold to one person, redeemed by another
 *
 * Metadata carries whatever the webhook needs to finish the job, because the
 * webhook is the only place a purchase is trusted to be complete. Nothing is
 * granted on the success redirect — a client can close the tab, and a
 * redirect can be forged.
 * ============================================================================
 */

export interface DepositCheckoutInput {
  customerId: string;
  appointmentId: string;
  businessId: string;
  clientId: string;
  amountCents: number;
  currency: string;
  serviceName: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createDepositCheckout(
  input: DepositCheckoutInput
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer: input.customerId,
    // Keep the card for later fee collection and one-tap rebooking.
    payment_intent_data: {
      setup_future_usage: 'off_session',
      metadata: {
        purpose: 'deposit',
        appointment_id: input.appointmentId,
        business_id: input.businessId,
        client_id: input.clientId,
      },
    },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: input.amountCents,
        product_data: {
          name: `Deposit — ${input.serviceName}`,
          description: 'Applied to your visit total.',
        },
      },
    }],
    metadata: {
      purpose: 'deposit',
      appointment_id: input.appointmentId,
      business_id: input.businessId,
      client_id: input.clientId,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Deposits hold a slot; a stale session should not hold it forever.
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });
}

export interface MembershipCheckoutInput {
  customerId: string;
  priceId: string;
  planId: string;
  businessId: string;
  clientId: string;
  trialDays?: number;
  successUrl: string;
  cancelUrl: string;
}

export async function createMembershipCheckout(
  input: MembershipCheckoutInput
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: input.customerId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    subscription_data: {
      ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
      metadata: {
        purpose: 'membership',
        plan_id: input.planId,
        business_id: input.businessId,
        client_id: input.clientId,
      },
    },
    metadata: {
      purpose: 'membership',
      plan_id: input.planId,
      business_id: input.businessId,
      client_id: input.clientId,
    },
    // Let members apply a save-flow or winback code at signup.
    allow_promotion_codes: true,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

export interface PackageCheckoutInput {
  customerId: string;
  packageId: string;
  businessId: string;
  clientId: string;
  amountCents: number;
  currency: string;
  packageName: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createPackageCheckout(
  input: PackageCheckoutInput
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer: input.customerId,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: input.amountCents,
        product_data: { name: input.packageName },
      },
    }],
    metadata: {
      purpose: 'package',
      package_id: input.packageId,
      business_id: input.businessId,
      client_id: input.clientId,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

export interface GiftCardCheckoutInput {
  customerId?: string;
  businessId: string;
  purchaserClientId?: string;
  amountCents: number;
  currency: string;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
  deliverAt?: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createGiftCardCheckout(
  input: GiftCardCheckoutInput
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  return stripe.checkout.sessions.create({
    mode: 'payment',
    ...(input.customerId ? { customer: input.customerId } : {}),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: input.amountCents,
        product_data: {
          name: 'Gift Card',
          description: input.recipientName
            ? `For ${input.recipientName}`
            : undefined,
        },
      },
    }],
    metadata: {
      purpose: 'gift_card',
      business_id: input.businessId,
      purchaser_client_id: input.purchaserClientId ?? '',
      recipient_name: input.recipientName ?? '',
      recipient_email: input.recipientEmail ?? '',
      message: (input.message ?? '').slice(0, 400),
      deliver_at: input.deliverAt ?? '',
      amount_cents: String(input.amountCents),
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

/**
 * Charge a stored card without the client present. Used for late-cancellation
 * and no-show fees, which are exactly the situation where the client is not
 * sitting in front of you to approve anything.
 */
export async function chargeStoredCard(opts: {
  customerId: string;
  amountCents: number;
  currency: string;
  description: string;
  metadata: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();

  const methods = await stripe.paymentMethods.list({
    customer: opts.customerId, type: 'card', limit: 1,
  });
  if (methods.data.length === 0) {
    throw new Error('No card on file for this customer.');
  }

  return stripe.paymentIntents.create({
    customer: opts.customerId,
    payment_method: methods.data[0].id,
    amount: opts.amountCents,
    currency: opts.currency.toLowerCase(),
    description: opts.description,
    confirm: true,
    off_session: true,
    metadata: opts.metadata,
  });
}
