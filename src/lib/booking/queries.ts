/**
 * ============================================================================
 * BOOKING DATA ACCESS
 * ============================================================================
 * All the I/O the availability engine deliberately does not do. Loads the
 * calendar inputs for a date range and hands them to `computeAvailability`.
 * ============================================================================
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { computeAvailability } from './availability';
import { resolveRules } from '@/lib/rules';
import type { DaySlots } from './types';
import { addDays } from '@/lib/utils';

export interface LoadAvailabilityArgs {
  businessId: string;
  serviceId: string;
  locationId?: string | null;
  /** Null = any provider who performs the service. */
  staffId?: string | null;
  fromDate: string;
  toDate: string;
  /** Extra add-ons extend the appointment and change what fits. */
  addonIds?: string[];
  /** Members can see further ahead. */
  priorityBookingDays?: number;
  now?: Date;
}

export async function loadAvailability(
  args: LoadAvailabilityArgs
): Promise<DaySlots[]> {
  const supabase = createAdminClient();

  const { data: business } = await supabase
    .from('businesses')
    .select('id, timezone, policy')
    .eq('id', args.businessId)
    .single();

  if (!business) return [];
  const rules = resolveRules(business.policy);

  const { data: service } = await supabase
    .from('services')
    .select('*')
    .eq('id', args.serviceId)
    .single();

  if (!service) return [];

  // Add-ons lengthen the appointment, so they must be folded into the
  // duration before slots are generated — otherwise the engine offers times
  // that cannot actually fit what the client selected.
  let extraMinutes = 0;
  if (args.addonIds?.length) {
    const { data: addons } = await supabase
      .from('addons')
      .select('duration_min')
      .in('id', args.addonIds);
    extraMinutes = (addons ?? []).reduce((sum, a) => sum + (a.duration_min ?? 0), 0);
  }

  const locationId =
    args.locationId ??
    (await supabase
      .from('locations')
      .select('id')
      .eq('business_id', args.businessId)
      .eq('active', true)
      .order('sort_order')
      .limit(1)
      .single()).data?.id;

  if (!locationId) return [];

  const { data: location } = await supabase
    .from('locations')
    .select('id, timezone, hours, hour_overrides')
    .eq('id', locationId)
    .single();

  if (!location) return [];

  // Providers who perform this service, at this location.
  let staffQuery = supabase
    .from('service_staff')
    .select('staff_id, price_override_cents, duration_override_min, staff!inner(id, display_name, price_multiplier, buffer_after_min, active, bookable)')
    .eq('service_id', args.serviceId);

  if (args.staffId) staffQuery = staffQuery.eq('staff_id', args.staffId);

  const { data: staffRows } = await staffQuery;

  const staff = (staffRows ?? [])
    .map((row) => {
      const s = row.staff as unknown as {
        id: string; display_name: string; price_multiplier: number;
        buffer_after_min: number | null; active: boolean; bookable: boolean;
      };
      return s?.active && s?.bookable
        ? {
            id: s.id,
            display_name: s.display_name,
            price_multiplier: s.price_multiplier,
            buffer_after_min: s.buffer_after_min,
            priceOverrideCents: row.price_override_cents,
            durationOverrideMin: row.duration_override_min,
          }
        : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (staff.length === 0) return [];

  const staffIds = staff.map((s) => s.id);

  // Widen the fetch window by a day either side so an appointment that
  // straddles midnight in the location's timezone is still seen.
  const fetchFrom = addDays(args.fromDate, -1).toISOString();
  const fetchTo = addDays(args.toDate, 2).toISOString();

  const [
    { data: schedules },
    { data: timeOff },
    { data: closures },
    { data: busy },
    { data: rooms },
  ] = await Promise.all([
    supabase
      .from('staff_schedules')
      .select('staff_id, weekday, start_time, end_time, effective_from, effective_to')
      .in('staff_id', staffIds)
      .eq('location_id', locationId),
    supabase
      .from('staff_time_off')
      .select('staff_id, starts_at, ends_at, recurrence')
      .in('staff_id', staffIds)
      .lte('starts_at', fetchTo)
      .gte('ends_at', fetchFrom),
    supabase
      .from('blocked_times')
      .select('starts_at, ends_at')
      .eq('business_id', args.businessId)
      .lte('starts_at', fetchTo)
      .gte('ends_at', fetchFrom),
    supabase
      .from('appointment_busy_blocks')
      .select('staff_id, room_id, block')
      .eq('business_id', args.businessId),
    supabase
      .from('rooms')
      .select('id, kind, capacity')
      .eq('location_id', locationId)
      .eq('active', true),
  ]);

  const unavailable = [
    ...(timeOff ?? []).map((t) => ({
      staffId: t.staff_id, from: t.starts_at, to: t.ends_at,
    })),
    ...(closures ?? []).map((b) => ({
      staffId: null, from: b.starts_at, to: b.ends_at,
    })),
  ];

  // Recurring daily breaks (lunch) are stored once; project them across the
  // requested range so every day gets the block.
  const recurringDaily = (timeOff ?? []).filter((t) => t.recurrence === 'daily');
  for (const block of recurringDaily) {
    const start = new Date(block.starts_at);
    const end = new Date(block.ends_at);
    const durationMs = end.getTime() - start.getTime();
    for (let i = -1; i <= 400; i++) {
      const day = addDays(args.fromDate, i);
      if (day > addDays(args.toDate, 1)) break;
      const projected = new Date(day);
      projected.setUTCHours(
        start.getUTCHours(), start.getUTCMinutes(), 0, 0
      );
      unavailable.push({
        staffId: block.staff_id,
        from: projected.toISOString(),
        to: new Date(projected.getTime() + durationMs).toISOString(),
      });
    }
  }

  return computeAvailability({
    service: {
      ...service,
      duration_min: service.duration_min + extraMinutes,
    },
    staff,
    schedules: schedules ?? [],
    unavailable,
    busy: busy ?? [],
    location,
    businessTimezone: business.timezone,
    rooms: rooms ?? [],
    fromDate: args.fromDate,
    toDate: args.toDate,
    rules: {
      slotIntervalMinutes: rules.booking.slotIntervalMinutes,
      minLeadTimeMinutes: rules.booking.minLeadTimeMinutes,
      maxAdvanceBookingDays: rules.booking.maxAdvanceBookingDays,
      defaultBufferBeforeMinutes: rules.booking.defaultBufferBeforeMinutes,
      defaultBufferAfterMinutes: rules.booking.defaultBufferAfterMinutes,
      allowProcessingTimeOverlap: rules.booking.allowProcessingTimeOverlap,
    },
    priorityBookingDays: args.priorityBookingDays,
    now: args.now,
  });
}

/** The public catalog for the booking page. */
export async function loadCatalog(businessId: string) {
  const supabase = createAdminClient();

  const [
    { data: categories },
    { data: services },
    { data: staff },
    { data: locations },
    { data: plans },
  ] = await Promise.all([
    supabase
      .from('service_categories')
      .select('*')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('sort_order'),
    supabase
      .from('services')
      .select('*, service_addons(addon_id, is_recommended, sort_order, addons(*))')
      .eq('business_id', businessId)
      .eq('active', true)
      .eq('online_bookable', true)
      .order('sort_order'),
    supabase
      .from('staff')
      .select('*, service_staff(service_id)')
      .eq('business_id', businessId)
      .eq('active', true)
      .eq('bookable', true)
      .order('sort_order'),
    supabase
      .from('locations')
      .select('*')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('sort_order'),
    supabase
      .from('membership_plans')
      .select('*')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('sort_order'),
  ]);

  return {
    categories: categories ?? [],
    services: services ?? [],
    staff: staff ?? [],
    locations: locations ?? [],
    plans: plans ?? [],
  };
}

/** Resolve the single business this deployment serves. */
export async function loadBusiness(slug?: string) {
  const supabase = createAdminClient();
  const targetSlug = slug ?? process.env.NEXT_PUBLIC_BUSINESS_SLUG;

  const query = supabase.from('businesses').select('*');
  const { data } = targetSlug
    ? await query.eq('slug', targetSlug).maybeSingle()
    : await query.order('created_at').limit(1).maybeSingle();

  return data;
}
