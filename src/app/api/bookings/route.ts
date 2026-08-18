import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { quote } from '@/lib/booking/pricing';
import { bookingRestrictions } from '@/lib/booking/cancellation';
import { dispatch, attributeBooking } from '@/lib/retention/dispatch';
import { isSupabaseConfigured } from '@/lib/demo';
import { toE164, generateCode } from '@/lib/utils';

const bodySchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().min(1).nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime(),
  addonIds: z.array(z.string()).default([]),
  /** Set when the booking came from the rebooking prompt on a prior visit. */
  rebookedFromId: z.string().uuid().nullable().optional(),
  source: z
    .enum(['online', 'admin', 'phone', 'walk_in', 'rebook_prompt', 'waitlist', 'campaign'])
    .default('online'),
  offerCode: z.string().optional(),
  client: z.object({
    id: z.string().uuid().optional(),
    firstName: z.string().min(1, 'First name is required.'),
    lastName: z.string().optional(),
    email: z.string().email('A valid email is required.'),
    phone: z.string().min(7, 'A valid phone number is required.'),
    notes: z.string().max(1000).optional(),
    smsOptIn: z.boolean().default(true),
    marketingOptIn: z.boolean().default(false),
  }),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return NextResponse.json(
      { error: first?.message ?? 'Invalid request.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Demo mode acknowledges the booking without persisting anything, so the
  // flow can be demonstrated end to end with no database.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      reference: generateCode('DEMO', 6),
      demo: true,
      message: 'Demo mode — this booking was not saved. Connect Supabase to persist it.',
    });
  }

  const supabase = createAdminClient();
  const business = await loadBusiness();
  if (!business) {
    return NextResponse.json({ error: 'Business not configured.' }, { status: 500 });
  }
  const rules = resolveRules(business.policy);

  // --- Service -------------------------------------------------------------

  const { data: service } = await supabase
    .from('services')
    .select('*')
    .eq('id', input.serviceId)
    .eq('business_id', business.id)
    .eq('active', true)
    .maybeSingle();

  if (!service) {
    return NextResponse.json({ error: 'That service is no longer available.' }, { status: 404 });
  }

  const locationId =
    input.locationId ??
    (await supabase
      .from('locations')
      .select('id')
      .eq('business_id', business.id)
      .eq('active', true)
      .order('sort_order')
      .limit(1)
      .maybeSingle()).data?.id;

  if (!locationId) {
    return NextResponse.json({ error: 'No bookable location.' }, { status: 500 });
  }

  // --- Client: find by email or phone, else create -------------------------

  const phoneE164 = toE164(input.client.phone);
  let clientId = input.client.id ?? null;

  if (!clientId) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('business_id', business.id)
      .or(`email.eq.${input.client.email}${phoneE164 ? `,phone.eq.${phoneE164}` : ''}`)
      .is('archived_at', null)
      .limit(1)
      .maybeSingle();

    clientId = existing?.id ?? null;
  }

  if (!clientId) {
    const { data: created, error: createError } = await supabase
      .from('clients')
      .insert({
        business_id: business.id,
        first_name: input.client.firstName,
        last_name: input.client.lastName ?? null,
        email: input.client.email,
        phone: phoneE164,
        sms_opt_in: input.client.smsOptIn,
        marketing_opt_in: input.client.marketingOptIn,
        preferred_location_id: locationId,
        preferred_staff_id: input.staffId ?? null,
        source: 'online',
      })
      .select('id')
      .single();

    if (createError || !created) {
      return NextResponse.json(
        { error: 'Could not create your profile. Please call us.' },
        { status: 500 }
      );
    }
    clientId = created.id;
  }

  // --- Behavioral restrictions --------------------------------------------

  const { data: metrics } = await supabase
    .from('client_metrics')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();

  const restrictions = bookingRestrictions(
    {
      noShowCount: metrics?.no_show_count ?? 0,
      lateCancelCount: metrics?.late_cancel_count ?? 0,
      hasCardOnFile: false,
    },
    rules
  );

  if (restrictions.blockedFromOnlineBooking) {
    return NextResponse.json({ error: restrictions.reason }, { status: 403 });
  }

  // Cap how many future appointments one client can hold at once.
  const { count: futureCount } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('status', ['requested', 'booked', 'confirmed'])
    .gt('starts_at', new Date().toISOString());

  if ((futureCount ?? 0) >= rules.booking.maxConcurrentFutureBookings) {
    return NextResponse.json(
      { error: 'You already have the maximum number of upcoming appointments booked.' },
      { status: 400 }
    );
  }

  // --- Membership context --------------------------------------------------

  const { data: membership } = await supabase
    .from('memberships')
    .select('*, membership_plans(*)')
    .eq('client_id', clientId)
    .in('status', ['active', 'trialing'])
    .maybeSingle();

  const plan = membership?.membership_plans as unknown as {
    discount_pct: number; retail_discount_pct: number;
    waives_deposits: boolean; credit_service_ids: string[];
  } | null;

  // --- Add-ons and pricing -------------------------------------------------

  const { data: addons } = input.addonIds.length
    ? await supabase.from('addons').select('*').in('id', input.addonIds)
    : { data: [] };

  const priced = quote({
    service,
    addons: (addons ?? []).map((a) => ({
      id: a.id, name: a.name, price_cents: a.price_cents,
      member_price_cents: a.member_price_cents, duration_min: a.duration_min,
      taxable: a.taxable,
    })),
    member: plan
      ? {
          discountPct: plan.discount_pct,
          retailDiscountPct: plan.retail_discount_pct,
          waivesDeposits: plan.waives_deposits,
          creditsAvailable: membership?.credits_balance ?? 0,
          creditCoversService:
            !plan.credit_service_ids?.length ||
            plan.credit_service_ids.includes(service.id),
        }
      : null,
    client: {
      isNewClient: (metrics?.completed_count ?? 0) === 0,
      noShowRisk: metrics?.no_show_risk ?? 35,
      noShowCount: metrics?.no_show_count ?? 0,
      lateCancelCount: metrics?.late_cancel_count ?? 0,
      hasCardOnFile: false,
    },
    rules,
    taxRateBps: business.tax_rate_bps,
  });

  // --- Build the appointment window ---------------------------------------

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + priced.durationMin * 60_000);

  const bufferBefore = service.buffer_before_min ?? rules.booking.defaultBufferBeforeMinutes;
  const bufferAfter = service.buffer_after_min ?? rules.booking.defaultBufferAfterMinutes;

  const hasGap =
    service.processing_time_min > 0 &&
    service.finish_time_min > 0 &&
    service.duration_min - service.processing_time_min - service.finish_time_min > 0;

  const initialMin = hasGap
    ? service.duration_min - service.processing_time_min - service.finish_time_min
    : 0;

  const { data: appointment, error: bookingError } = await supabase
    .from('appointments')
    .insert({
      business_id: business.id,
      location_id: locationId,
      client_id: clientId,
      staff_id: input.staffId ?? null,
      service_id: service.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      blocks_at: new Date(startsAt.getTime() - bufferBefore * 60_000).toISOString(),
      blocks_until: new Date(endsAt.getTime() + bufferAfter * 60_000).toISOString(),
      gap_starts_at: hasGap
        ? new Date(startsAt.getTime() + initialMin * 60_000).toISOString()
        : null,
      gap_ends_at: hasGap
        ? new Date(startsAt.getTime() + (initialMin + service.processing_time_min) * 60_000).toISOString()
        : null,
      duration_min: priced.durationMin,
      status: 'booked',
      source: input.source,
      price_cents: priced.lines.find((l) => l.kind === 'service')?.totalCents ?? 0,
      addons_cents: priced.lines
        .filter((l) => l.kind === 'addon')
        .reduce((sum, l) => sum + l.totalCents, 0),
      deposit_cents: priced.deposit.amountCents,
      rebooked_from_id: input.rebookedFromId ?? null,
      client_notes: input.client.notes ?? null,
    })
    .select('id, starts_at')
    .single();

  // The exclusion constraint on appointment_busy_blocks is the authority on
  // whether a slot is free. Losing that race is normal, not exceptional —
  // two people can tap the same time within the same second.
  if (bookingError) {
    if (bookingError.code === '23P01') {
      return NextResponse.json(
        { error: 'Sorry — that time was just taken. Please pick another.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Could not complete your booking. Please try again.' },
      { status: 500 }
    );
  }

  // --- Add-on rows ---------------------------------------------------------

  if (addons?.length) {
    await supabase.from('appointment_addons').insert(
      addons.map((a) => ({
        appointment_id: appointment.id,
        addon_id: a.id,
        name_snapshot: a.name,
        price_cents:
          priced.lines.find((l) => l.kind === 'addon' && l.referenceId === a.id)
            ?.totalCents ?? a.price_cents,
        duration_min: a.duration_min,
        from_upsell: true,
      }))
    );
  }

  // --- Side effects: confirmation + attribution ----------------------------
  // Neither can be allowed to fail the booking. The appointment is real; a
  // confirmation that didn't send is a smaller problem than a lost booking.

  await Promise.allSettled([
    dispatch({
      businessId: business.id,
      campaignKey: 'confirm_booking',
      clientId,
      occurrence: appointment.id,
      appointmentId: appointment.id,
      transactional: true,
    }),
    attributeBooking({
      clientId,
      appointmentId: appointment.id,
      valueCents: priced.totalCents,
    }),
  ]);

  return NextResponse.json({
    reference: appointment.id.slice(0, 8).toUpperCase(),
    appointmentId: appointment.id,
    startsAt: appointment.starts_at,
    totalCents: priced.totalCents,
    deposit: priced.deposit,
  });
}
