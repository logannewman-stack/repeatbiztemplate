import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/demo';
import { isStripeConfigured } from '@/lib/stripe/client';
import { createBillingPortalSession, ensureStripeCustomer } from '@/lib/stripe/customers';

/**
 * Redirect a member to Stripe's billing portal so they can update a card
 * without staff handling it. Most involuntary churn is an expired card, and
 * every extra step between "my payment failed" and "fixed" costs recoveries.
 */
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!isSupabaseConfigured() || !isStripeConfigured()) {
    return NextResponse.redirect(`${appUrl}/account/membership?error=not_configured`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${appUrl}/login?next=/account/membership`);

  const admin = createAdminClient();
  const { data: client } = await admin
    .from('clients')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!client) return NextResponse.redirect(`${appUrl}/account`);

  try {
    const customerId = await ensureStripeCustomer(client);
    const session = await createBillingPortalSession(
      customerId,
      `${appUrl}/account/membership`
    );
    return NextResponse.redirect(session.url);
  } catch {
    return NextResponse.redirect(`${appUrl}/account/membership?error=portal_failed`);
  }
}
