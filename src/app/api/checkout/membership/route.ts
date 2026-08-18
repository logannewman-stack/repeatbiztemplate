import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { isStripeConfigured } from '@/lib/stripe/client';
import { ensureStripeCustomer } from '@/lib/stripe/customers';
import { createMembershipCheckout } from '@/lib/stripe/checkout';
import { syncPlanToStripe } from '@/lib/stripe/subscriptions';

const bodySchema = z.object({
  planId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Payments are not configured for this build yet.' },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const business = await loadBusiness();
  if (!business) {
    return NextResponse.json({ error: 'Business not configured.' }, { status: 500 });
  }

  const admin = createAdminClient();

  const [{ data: plan }, { data: client }] = await Promise.all([
    admin.from('membership_plans').select('*').eq('id', parsed.data.planId).maybeSingle(),
    admin.from('clients').select('*').eq('id', parsed.data.clientId).maybeSingle(),
  ]);

  if (!plan || !client) {
    return NextResponse.json({ error: 'Plan or client not found.' }, { status: 404 });
  }

  // Membership caps are a real scarcity lever, and also protect capacity —
  // selling more included visits than the providers can deliver is how a
  // membership program turns into a complaint queue.
  if (plan.max_members) {
    const { count } = await admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', plan.id)
      .in('status', ['active', 'trialing', 'past_due', 'paused']);

    if ((count ?? 0) >= plan.max_members) {
      return NextResponse.json(
        { error: 'This membership is currently full. Ask us about the waitlist.' },
        { status: 409 }
      );
    }
  }

  const { data: existing } = await admin
    .from('memberships')
    .select('id, status')
    .eq('client_id', client.id)
    .in('status', ['active', 'trialing', 'past_due', 'paused', 'cancelling'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'You already have a membership. Contact us to change plans.' },
      { status: 409 }
    );
  }

  const priceId = plan.stripe_price_id ?? (await syncPlanToStripe(plan.id));
  const customerId = await ensureStripeCustomer(client);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const session = await createMembershipCheckout({
    customerId,
    priceId,
    planId: plan.id,
    businessId: business.id,
    clientId: client.id,
    trialDays: plan.trial_days || undefined,
    successUrl: `${appUrl}/account/membership?welcome=1`,
    cancelUrl: `${appUrl}/memberships`,
  });

  return NextResponse.json({ url: session.url });
}
