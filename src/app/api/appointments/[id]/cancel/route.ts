import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { evaluateCancellation } from '@/lib/booking/cancellation';
import { chargeStoredCard } from '@/lib/stripe/checkout';
import { isStripeConfigured } from '@/lib/stripe/client';

const bodySchema = z.object({
  reason: z.string().max(500).optional(),
  /** Set by staff acting on a client's behalf. */
  initiatedBy: z.enum(['client', 'staff', 'system']).default('client'),
  /** Client has seen and accepted the fee. Guards against surprise charges. */
  acknowledgedFee: z.boolean().default(false),
});

/**
 * Cancel an appointment.
 *
 * The fee is quoted before it is charged: a request without `acknowledgedFee`
 * returns a 402 describing the outcome rather than performing it, so the client
 * always sees the number before agreeing to it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const business = await loadBusiness();
  if (!business) {
    return NextResponse.json({ error: 'Business not configured.' }, { status: 500 });
  }

  const rules = resolveRules(business.policy);
  const admin = createAdminClient();

  const { data: appointment } = await admin
    .from('appointments')
    .select('*, clients(id, user_id, stripe_customer_id)')
    .eq('id', id)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
  }

  if (['cancelled', 'completed', 'no_show'].includes(appointment.status)) {
    return NextResponse.json(
      { error: 'This appointment can no longer be cancelled.' },
      { status: 409 }
    );
  }

  // --- Authorization -------------------------------------------------------
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const client = appointment.clients as unknown as {
    id: string; user_id: string | null; stripe_customer_id: string | null;
  } | null;

  let actor: 'client' | 'staff' = 'client';
  if (user) {
    const { data: staff } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();
    if (staff) actor = 'staff';
    else if (client?.user_id !== user.id) {
      return NextResponse.json({ error: 'Not your appointment.' }, { status: 403 });
    }
  }

  const initiatedBy =
    parsed.data.initiatedBy === 'client' ? actor : parsed.data.initiatedBy;

  // --- Policy --------------------------------------------------------------

  const outcome = evaluateCancellation(
    {
      startsAt: appointment.starts_at,
      servicePriceCents: appointment.price_cents,
      addonsCents: appointment.addons_cents,
      depositCents: appointment.deposit_cents,
      depositPaidAt: appointment.deposit_paid_at,
      rescheduleCount: appointment.reschedule_count,
      isMember: false,
      initiatedBy,
    },
    rules
  );

  // Quote first, charge second. Never surprise someone with a fee.
  if (outcome.feeCents > 0 && !parsed.data.acknowledgedFee) {
    return NextResponse.json(
      {
        requiresAcknowledgement: true,
        feeCents: outcome.feeCents,
        feeExplanation: outcome.feeExplanation,
        shouldOfferReschedule: outcome.shouldOfferReschedule,
        freeReschedulesLeft: outcome.freeReschedulesLeft,
      },
      { status: 402 }
    );
  }

  // --- Charge --------------------------------------------------------------

  let feeCharged = 0;
  if (outcome.feeCents > 0 && isStripeConfigured() && client?.stripe_customer_id) {
    try {
      const intent = await chargeStoredCard({
        customerId: client.stripe_customer_id,
        amountCents: outcome.feeCents,
        currency: business.currency,
        description: 'Late cancellation fee',
        metadata: { appointment_id: id, purpose: 'cancellation_fee' },
      });
      feeCharged = outcome.feeCents;

      await admin.from('payments').insert({
        business_id: business.id,
        client_id: client.id,
        appointment_id: id,
        amount_cents: outcome.feeCents,
        currency: business.currency,
        status: 'succeeded',
        method: 'card',
        purpose: 'cancellation_fee',
        stripe_payment_intent_id: intent.id,
        processed_at: new Date().toISOString(),
      });
    } catch {
      // No card on file, or the charge declined. Record the fee as owed
      // rather than blocking the cancellation — holding the slot helps nobody.
      feeCharged = 0;
    }
  }

  // --- Release the slot ----------------------------------------------------
  // The busy-block trigger frees the time as soon as the status changes, so
  // the waitlist job can offer it on its next run.

  await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: initiatedBy,
      cancellation_reason: parsed.data.reason ?? null,
      cancellation_fee_cents: outcome.feeCents,
    })
    .eq('id', id);

  await admin.from('audit_log').insert({
    business_id: business.id,
    actor_user_id: user?.id ?? null,
    action: 'appointment.cancelled',
    entity_type: 'appointment',
    entity_id: id,
    after: {
      fee_cents: outcome.feeCents,
      fee_charged: feeCharged,
      initiated_by: initiatedBy,
      reason: parsed.data.reason ?? null,
    },
  });

  return NextResponse.json({
    cancelled: true,
    feeCents: outcome.feeCents,
    feeCharged,
    refundCents: outcome.refundCents,
  });
}
