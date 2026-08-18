import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRules } from '@/lib/rules';
import { isSupabaseConfigured } from '@/lib/demo';
import {
  pauseMembership, resumeMembership, changeMembershipPlan,
  applySaveDiscount, cancelMembership, recordSaveOfferShown,
} from '@/lib/stripe/subscriptions';
import { isStripeConfigured } from '@/lib/stripe/client';

/**
 * ============================================================================
 * MEMBERSHIP ACTIONS
 * ============================================================================
 * Pause, resume, change plan, accept a save offer, cancel.
 *
 * Every action authorizes against the signed-in user's own membership, or a
 * staff member acting on their behalf. A membership id is not a bearer token:
 * unlike an appointment reminder link, these actions move money.
 * ============================================================================
 */

const ACTIONS = ['pause', 'resume', 'change-plan', 'save-offer', 'cancel'] as const;
type Action = (typeof ACTIONS)[number];

const bodySchema = z.object({
  months: z.coerce.number().int().min(1).max(12).optional(),
  planId: z.string().uuid().optional(),
  kind: z.string().optional(),
  value: z.coerce.number().optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params;

  if (!ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 404 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Demo mode — connect Supabase to manage memberships.' },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'You are not signed in.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('memberships')
    .select('*, clients(user_id), membership_plans(*)')
    .eq('id', id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });
  }

  // The member themselves, or a manager of the business.
  const owner = membership.clients as unknown as { user_id: string | null } | null;
  let authorized = owner?.user_id === user.id;

  if (!authorized) {
    const { data: staff } = await admin
      .from('staff')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', membership.business_id)
      .eq('active', true)
      .in('role', ['owner', 'manager'])
      .maybeSingle();
    authorized = Boolean(staff);
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Not your membership.' }, { status: 403 });
  }

  const { data: business } = await admin
    .from('businesses')
    .select('policy')
    .eq('id', membership.business_id)
    .single();
  const rules = resolveRules(business?.policy);

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const body = parsed.data;

  // Pausing and cancelling work without Stripe (the local record is the source
  // of truth for benefits); anything that moves money does not.
  const needsStripe = action === 'change-plan' || action === 'save-offer';
  if (needsStripe && !isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Billing is not configured for this business yet. Give us a call.' },
      { status: 503 }
    );
  }

  try {
    switch (action as Action) {
      case 'pause': {
        const { resumesAt } = await pauseMembership(
          id, body.months ?? rules.memberships.maxPauseMonths, rules
        );
        await recordSaveOfferShown(id, 'pause');
        return NextResponse.json({
          ok: true,
          message: `Paused until ${resumesAt.toLocaleDateString()}. Your rate and credits are held.`,
        });
      }

      case 'resume': {
        await resumeMembership(id);
        return NextResponse.json({ ok: true, message: 'Your membership is active again.' });
      }

      case 'change-plan': {
        if (!body.planId) {
          return NextResponse.json({ error: 'Pick a plan.' }, { status: 400 });
        }
        await changeMembershipPlan(id, body.planId);
        await recordSaveOfferShown(id, 'downgrade');
        return NextResponse.json({ ok: true, message: 'Plan changed.' });
      }

      case 'save-offer': {
        if (body.kind === 'discount') {
          await applySaveDiscount(id, body.value ?? 50, 2);
          await recordSaveOfferShown(id, 'discount');
          return NextResponse.json({
            ok: true,
            message: `${body.value ?? 50}% off applied for the next two months.`,
          });
        }

        if (body.kind === 'free_month') {
          await applySaveDiscount(id, 100, 1);
          await recordSaveOfferShown(id, 'free_month');
          return NextResponse.json({ ok: true, message: 'Your next month is on us.' });
        }

        if (body.kind === 'extra_credit') {
          await admin.rpc('grant_membership_credits', {
            p_membership_id: id,
            p_amount: body.value ?? 1,
            p_reason: 'save_offer',
          });
          await recordSaveOfferShown(id, 'extra_credit');
          return NextResponse.json({ ok: true, message: 'Extra credit added to your account.' });
        }

        return NextResponse.json({ error: 'Unknown offer.' }, { status: 400 });
      }

      case 'cancel': {
        // Cancelling at period end, never immediately: the member keeps what
        // they already paid for, which is fairer and far less likely to end in
        // a dispute than a forfeited partial month.
        const { endsAt } = await cancelMembership(id, { reason: body.reason });
        return NextResponse.json({
          ok: true,
          endsAt,
          message: endsAt
            ? `Cancelled. Your benefits run until ${new Date(endsAt).toLocaleDateString()}.`
            : 'Your membership has been cancelled.',
        });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Something went wrong.' },
      { status: 500 }
    );
  }
}
