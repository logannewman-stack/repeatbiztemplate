import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { dispatch } from '@/lib/retention/dispatch';
import { selectWinbackOffer } from '@/lib/retention/rebooking';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateCode } from '@/lib/utils';

const bodySchema = z.object({
  clientId: z.string().uuid(),
  lifecycle: z.string().optional(),
});

/**
 * Manual nudge from the retention queue. Staff-only.
 *
 * `force: true` bypasses the cooldown, because a person clicking this button
 * has decided the client should hear from them now — but the dedupe key still
 * scopes to the day, so a double-click cannot send twice.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data: staff } = await supabase
    .from('staff')
    .select('id, business_id')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (!staff) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const business = await loadBusiness();
  if (!business || business.id !== staff.business_id) {
    return NextResponse.json({ error: 'Business mismatch.' }, { status: 403 });
  }

  const rules = resolveRules(business.policy);
  const admin = createAdminClient();

  // A lapsed client gets a real offer code; a merely-due one does not need
  // discounting to come back, and habitually discounting them trains the habit.
  let varsOverride: Record<string, unknown> | undefined;
  let campaignKey = 'rebook_due';

  if (parsed.data.lifecycle === 'lapsed') {
    const { data: metrics } = await admin
      .from('client_metrics')
      .select('last_visit_at, lapse_at')
      .eq('client_id', parsed.data.clientId)
      .maybeSingle();

    const daysLapsed = metrics?.lapse_at
      ? Math.max(
          Math.round((Date.now() - new Date(metrics.lapse_at).getTime()) / 86_400_000),
          0
        )
      : 30;

    const offer = selectWinbackOffer(daysLapsed, rules);
    campaignKey = daysLapsed >= 90 ? 'winback_90' : 'winback_30';

    if (offer) {
      const code = generateCode('BACK', 6);
      await admin.from('offers').insert({
        business_id: business.id,
        client_id: parsed.data.clientId,
        code,
        label: offer.label,
        kind: offer.kind,
        value: offer.value,
        source: 'winback',
        max_redemptions: 1,
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });
      varsOverride = { offer: { label: offer.label, code } };
    }
  }

  const result = await dispatch({
    businessId: business.id,
    campaignKey,
    clientId: parsed.data.clientId,
    occurrence: `manual:${new Date().toISOString().slice(0, 10)}`,
    force: true,
    varsOverride: varsOverride as never,
  });

  return NextResponse.json(result, {
    status: result.status === 'failed' ? 500 : 200,
  });
}
