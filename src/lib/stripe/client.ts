import Stripe from 'stripe';

/**
 * Server-side Stripe client. Lazily constructed so the app still builds and
 * runs (booking, calendar, CRM) before Stripe is wired up for a new client.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Payments, deposits, and memberships are ' +
      'disabled until it is. See SETUP.md step 3.'
    );
  }

  cached = new Stripe(key, {
    apiVersion: '2025-02-24.acacia',
    appInfo: { name: 'Repeat Biz Template', version: '1.0.0' },
    typescript: true,
    // Stripe retries idempotently on network errors.
    maxNetworkRetries: 2,
  });
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
