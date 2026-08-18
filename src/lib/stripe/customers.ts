import { getStripe } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Client } from '@/types/database';

/**
 * Find or create the Stripe customer for a client, and cache the id back onto
 * the client row. Called before any charge, deposit, or subscription.
 */
export async function ensureStripeCustomer(
  client: Pick<Client, 'id' | 'email' | 'phone' | 'first_name' | 'last_name' | 'stripe_customer_id' | 'business_id'>
): Promise<string> {
  if (client.stripe_customer_id) return client.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: client.email ?? undefined,
    phone: client.phone ?? undefined,
    name: [client.first_name, client.last_name].filter(Boolean).join(' '),
    metadata: {
      client_id: client.id,
      business_id: client.business_id,
    },
  });

  const supabase = createAdminClient();
  await supabase
    .from('clients')
    .update({ stripe_customer_id: customer.id })
    .eq('id', client.id);

  return customer.id;
}

/**
 * A Setup Intent collects a card without charging it. Used when policy
 * requires a card on file after repeated late cancels — the client is not
 * charged now, but a no-show fee becomes collectible.
 */
export async function createSetupIntent(customerId: string) {
  const stripe = getStripe();
  return stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
  });
}

/** Billing portal so members can update a card without staff involvement. */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID
      ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID }
      : {}),
  });
}
