import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { evaluateReschedule } from '@/lib/booking/cancellation';

const bodySchema = z.object({
  startsAt: z.string().datetime(),
  staffId: z.string().uuid().nullable().optional(),
  acknowledgedFee: z.boolean().default(false),
});

/**
 * Move an appointment.
 *
 * Implemented as create-then-terminate rather than an in-place update: the new
 * booking is inserted first, and only once it succeeds is the old one marked
 * `rescheduled`. If the new time turns out to be taken, the client still has
 * their original appointment — losing both would be the worst outcome.
 *
 * The old row keeps a pointer to the new one, so the visit's history stays
 * intact for the cadence and retention calculations.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const business = await loadBusiness();
  if (!business) {
    return NextResponse.json({ error: 'Business not configured.' }, { status: 500 });
  }

  const rules = resolveRules(business.policy);
  const admin = createAdminClient();

  const { data: original } = await admin
    .from('appointments')
    .select('*, services(*)')
    .eq('id', id)
    .maybeSingle();

  if (!original) {
    return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
  }

  if (!['booked', 'confirmed', 'requested'].includes(original.status)) {
    return NextResponse.json(
      { error: 'This appointment can no longer be moved.' },
      { status: 409 }
    );
  }

  const outcome = evaluateReschedule(
    {
      startsAt: original.starts_at,
      servicePriceCents: original.price_cents,
      addonsCents: original.addons_cents,
      depositCents: original.deposit_cents,
      depositPaidAt: original.deposit_paid_at,
      rescheduleCount: original.reschedule_count,
      isMember: false,
      initiatedBy: 'client',
    },
    rules
  );

  if (outcome.feeCents > 0 && !parsed.data.acknowledgedFee) {
    return NextResponse.json(
      {
        requiresAcknowledgement: true,
        feeCents: outcome.feeCents,
        explanation: outcome.explanation,
      },
      { status: 402 }
    );
  }

  const service = original.services as unknown as {
    duration_min: number; processing_time_min: number; finish_time_min: number;
    buffer_before_min: number | null; buffer_after_min: number | null;
  };

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(startsAt.getTime() + original.duration_min * 60_000);
  const bufferBefore = service.buffer_before_min ?? rules.booking.defaultBufferBeforeMinutes;
  const bufferAfter = service.buffer_after_min ?? rules.booking.defaultBufferAfterMinutes;

  const hasGap =
    service.processing_time_min > 0 &&
    service.finish_time_min > 0 &&
    service.duration_min - service.processing_time_min - service.finish_time_min > 0;
  const initialMin = hasGap
    ? service.duration_min - service.processing_time_min - service.finish_time_min
    : 0;

  const { data: replacement, error } = await admin
    .from('appointments')
    .insert({
      business_id: original.business_id,
      location_id: original.location_id,
      client_id: original.client_id,
      staff_id: parsed.data.staffId ?? original.staff_id,
      service_id: original.service_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      blocks_at: new Date(startsAt.getTime() - bufferBefore * 60_000).toISOString(),
      blocks_until: new Date(endsAt.getTime() + bufferAfter * 60_000).toISOString(),
      gap_starts_at: hasGap
        ? new Date(startsAt.getTime() + initialMin * 60_000).toISOString() : null,
      gap_ends_at: hasGap
        ? new Date(startsAt.getTime() + (initialMin + service.processing_time_min) * 60_000).toISOString()
        : null,
      duration_min: original.duration_min,
      status: 'booked',
      source: original.source,
      price_cents: original.price_cents,
      addons_cents: original.addons_cents,
      deposit_cents: original.deposit_cents,
      deposit_paid_at: original.deposit_paid_at,
      deposit_payment_intent_id: original.deposit_payment_intent_id,
      // Carry the count forward so free reschedules are actually finite.
      reschedule_count: original.reschedule_count + 1,
      rebooked_from_id: original.rebooked_from_id,
      client_notes: original.client_notes,
    })
    .select('id, starts_at')
    .single();

  if (error) {
    if (error.code === '23P01') {
      return NextResponse.json(
        { error: 'That time was just taken. Please pick another.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Could not move the appointment.' }, { status: 500 });
  }

  // Copy add-ons across.
  const { data: addons } = await admin
    .from('appointment_addons')
    .select('*')
    .eq('appointment_id', id);

  if (addons?.length) {
    await admin.from('appointment_addons').insert(
      addons.map((a) => ({
        appointment_id: replacement.id,
        addon_id: a.addon_id,
        name_snapshot: a.name_snapshot,
        price_cents: a.price_cents,
        duration_min: a.duration_min,
        from_upsell: a.from_upsell,
      }))
    );
  }

  // Only now retire the original — this is what frees the old slot.
  await admin
    .from('appointments')
    .update({
      status: 'rescheduled',
      rescheduled_to_id: replacement.id,
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'client',
      cancellation_fee_cents: outcome.feeCents,
    })
    .eq('id', id);

  await admin.from('audit_log').insert({
    business_id: business.id,
    action: 'appointment.rescheduled',
    entity_type: 'appointment',
    entity_id: id,
    after: { new_appointment_id: replacement.id, fee_cents: outcome.feeCents },
  });

  return NextResponse.json({
    rescheduled: true,
    appointmentId: replacement.id,
    startsAt: replacement.starts_at,
    feeCents: outcome.feeCents,
  });
}
