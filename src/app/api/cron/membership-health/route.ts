import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { dispatch } from '@/lib/retention/dispatch';
import { membershipSavingsPitch } from '@/lib/booking/pricing';
import { authorizeCron, summarize } from '@/lib/cron';

/**
 * ============================================================================
 * MEMBERSHIP HEALTH — protects and grows MRR. Runs daily.
 * ============================================================================
 * Three jobs, in order of how much money each protects:
 *
 *   1. Resume paused memberships whose pause window has ended
 *   2. Warn members with credits about to expire — an unused credit is the
 *      strongest predictor of a cancellation next month
 *   3. Pitch a membership to non-members whose recent spend already exceeds
 *      the plan price
 * ============================================================================
 */
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const startedAt = Date.now();
  const business = await loadBusiness();
  if (!business) {
    return NextResponse.json({ error: 'Business not configured.' }, { status: 500 });
  }

  const rules = resolveRules(business.policy);
  const supabase = createAdminClient();
  const results: Array<{ status: string }> = [];
  let resumed = 0;
  let pitched = 0;

  // --- 1. Resume finished pauses -------------------------------------------

  const { data: toResume } = await supabase
    .from('memberships')
    .select('id')
    .eq('business_id', business.id)
    .eq('status', 'paused')
    .lte('paused_until', new Date().toISOString());

  for (const membership of toResume ?? []) {
    // Stripe resumes billing on its own via `resumes_at`; this mirrors the
    // state locally so the app agrees with Stripe rather than waiting for a
    // webhook that may be hours away.
    await supabase
      .from('memberships')
      .update({ status: 'active', paused_at: null, paused_until: null })
      .eq('id', membership.id);
    resumed++;
  }

  // --- 2. Expiring credits --------------------------------------------------
  // A member who never redeems is paying for nothing and will notice.

  const warnBefore = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const { data: expiring } = await supabase
    .from('membership_credit_ledger')
    .select('membership_id, expires_at, memberships!inner(id, client_id, credits_balance, status)')
    .eq('business_id', business.id)
    .gt('delta', 0)
    .not('expires_at', 'is', null)
    .lte('expires_at', warnBefore)
    .gte('expires_at', new Date().toISOString());

  const warned = new Set<string>();
  for (const row of expiring ?? []) {
    const membership = row.memberships as unknown as {
      id: string; client_id: string; credits_balance: number; status: string;
    } | null;

    if (!membership || membership.status !== 'active') continue;
    if (membership.credits_balance < 1) continue;
    if (warned.has(membership.id)) continue;
    warned.add(membership.id);

    const result = await dispatch({
      businessId: business.id,
      campaignKey: 'credit_expiring',
      clientId: membership.client_id,
      occurrence: `${membership.id}:${String(row.expires_at).slice(0, 10)}`,
      membershipId: membership.id,
      varsOverride: {
        membership: {
          credits: membership.credits_balance,
          credits_expire_on: row.expires_at ?? undefined,
        },
      } as never,
    });
    results.push(result);
  }

  // --- 3. Membership pitch --------------------------------------------------
  // The pitch that converts is arithmetic about the client's own spending.

  if (rules.memberships.promptWhenSpendExceedsPlan) {
    const { data: plans } = await supabase
      .from('membership_plans')
      .select('*')
      .eq('business_id', business.id)
      .eq('active', true)
      .order('price_cents')
      .limit(1);

    const plan = plans?.[0];

    if (plan) {
      const { data: candidates } = await supabase
        .from('client_metrics')
        .select('client_id, spend_90d_cents, completed_count')
        .eq('business_id', business.id)
        .gte('spend_90d_cents', plan.price_cents * 2)
        .in('lifecycle', ['active', 'vip', 'due'])
        .limit(100);

      for (const candidate of candidates ?? []) {
        // Skip anyone who already has a membership.
        const { data: existing } = await supabase
          .from('memberships')
          .select('id')
          .eq('client_id', candidate.client_id)
          .in('status', ['active', 'trialing', 'past_due', 'paused'])
          .maybeSingle();
        if (existing) continue;

        const pitch = membershipSavingsPitch({
          spendLookbackDays: rules.memberships.spendLookbackDays,
          spendInPeriodCents: candidate.spend_90d_cents,
          visitsInPeriod: Math.max(candidate.completed_count, 1),
          plan: {
            name: plan.name,
            price_cents: plan.price_cents,
            included_credits: plan.included_credits,
            discount_pct: plan.discount_pct,
            billing_interval: plan.billing_interval,
          },
        });

        // Only pitch when the plan genuinely saves them money. A bad-faith
        // pitch costs more trust than the sale is worth.
        if (!pitch) continue;
        pitched++;

        const result = await dispatch({
          businessId: business.id,
          campaignKey: 'membership_pitch',
          clientId: candidate.client_id,
          occurrence: `pitch:${new Date().toISOString().slice(0, 7)}`,
          varsOverride: {
            membership: {
              plan_name: pitch.planName,
              savings_cents: pitch.savingsCents,
              would_have_paid_cents: pitch.wouldHavePaidCents,
            },
          } as never,
        });
        results.push(result);
      }
    }
  }

  return NextResponse.json(
    summarize('membership-health', startedAt, results, { resumed, pitched })
  );
}
