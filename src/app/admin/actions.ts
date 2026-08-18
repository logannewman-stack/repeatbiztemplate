'use server';

/**
 * ============================================================================
 * ADMIN SERVER ACTIONS
 * ============================================================================
 * Everything the setup wizard and the admin CRUD screens write. Each action
 * authorizes first, validates with zod second, and writes third — a server
 * action is a public POST endpoint, so the middleware gating navigation to
 * /admin is not authorization for these.
 * ============================================================================
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff, actionError, type ActionResult } from '@/lib/admin/auth';
import { resolveBrand, derivePalette } from '@/lib/brand';
import { verticals, type VerticalPreset } from '@/config/verticals';
import { slugify } from '@/lib/utils';
import type { VerticalKey } from '@/config/brand';

const DEMO_ERROR =
  'Demo mode — connect Supabase to save changes. See SETUP.md.';

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

const brandSchema = z.object({
  name: z.string().min(1, 'Business name is required.').max(120),
  shortName: z.string().max(60).optional(),
  tagline: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  vertical: z.string().optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email('Enter a valid email.').or(z.literal('')).optional(),
  website: z.string().max(200).optional(),
  instagram: z.string().max(80).optional(),
  /** Hex from the client's brand guide; converted to OKLCH on save. */
  brandColor: z.string().regex(/^#?[0-9a-fA-F]{3,6}$/, 'Enter a hex color.').optional(),
  radius: z.enum(['sharp', 'soft', 'round']).optional(),
  logoUrl: z.string().optional(),
  logoMarkUrl: z.string().optional(),
  heroUrl: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  taxRatePercent: z.coerce.number().min(0).max(30).optional(),
});

export async function saveBrand(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const parsed = brandSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input.' };
    }
    const input = parsed.data;

    const supabase = createAdminClient();
    const { data: business } = await supabase
      .from('businesses')
      .select('branding, name')
      .eq('id', ctx.businessId)
      .single();

    const current = resolveBrand(business?.branding);

    // Only a supplied color regenerates the palette. Re-deriving on every save
    // would silently discard any hand-tuned colors the operator set.
    const colors = input.brandColor
      ? derivePalette(input.brandColor)
      : current.colors;

    const branding = {
      ...current,
      name: input.name,
      shortName: input.shortName || input.name,
      tagline: input.tagline ?? current.tagline,
      description: input.description ?? current.description,
      vertical: (input.vertical as VerticalKey) ?? current.vertical,
      radius: input.radius ?? current.radius,
      colors,
      contact: {
        ...current.contact,
        phone: input.phone ?? current.contact.phone,
        email: input.email || current.contact.email,
        website: input.website ?? current.contact.website,
        instagram: input.instagram ?? current.contact.instagram,
      },
      assets: {
        ...current.assets,
        logo: input.logoUrl || current.assets.logo,
        logoMark: input.logoMarkUrl || current.assets.logoMark,
        heroImage: input.heroUrl || current.assets.heroImage,
      },
    };

    const { error } = await supabase
      .from('businesses')
      .update({
        name: input.name,
        branding,
        ...(input.vertical ? { vertical: input.vertical } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.taxRatePercent != null
          ? { tax_rate_bps: Math.round(input.taxRatePercent * 100) }
          : {}),
      })
      .eq('id', ctx.businessId);

    if (error) throw error;

    // Branding touches the header on every page, so revalidate the whole tree.
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Saved.' };
  } catch (err) {
    return actionError(err);
  }
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required.').max(120),
  description: z.string().max(1000).optional(),
  categoryId: z.string().uuid().or(z.literal('')).optional(),
  durationMin: z.coerce.number().int().min(5).max(720),
  processingMin: z.coerce.number().int().min(0).max(300).default(0),
  finishMin: z.coerce.number().int().min(0).max(300).default(0),
  price: z.coerce.number().min(0).max(100000),
  memberPrice: z.coerce.number().min(0).max(100000).optional(),
  rebookIntervalDays: z.coerce.number().int().min(1).max(730),
  depositMode: z.enum(['none', 'flat', 'percent', 'full']).default('none'),
  depositPercent: z.coerce.number().int().min(0).max(100).default(0),
  depositFlat: z.coerce.number().min(0).max(10000).default(0),
  onlineBookable: z.coerce.boolean().default(true),
  active: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveService(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const raw = Object.fromEntries(formData);
    const parsed = serviceSchema.safeParse({
      ...raw,
      onlineBookable: raw.onlineBookable === 'on' || raw.onlineBookable === 'true',
      active: raw.active === 'on' || raw.active === 'true',
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input.' };
    }
    const s = parsed.data;

    // A processing gap only makes sense if provider-attended time remains on
    // both sides of it; otherwise the availability engine ignores it anyway.
    if (s.processingMin > 0 && s.durationMin - s.processingMin - s.finishMin <= 0) {
      return {
        ok: false,
        error:
          'Processing time plus finishing time must leave some hands-on time at the start of the service.',
      };
    }

    const supabase = createAdminClient();
    const payload = {
      business_id: ctx.businessId,
      name: s.name,
      slug: slugify(s.name),
      description: s.description || null,
      category_id: s.categoryId || null,
      duration_min: s.durationMin,
      processing_time_min: s.processingMin,
      finish_time_min: s.finishMin,
      price_cents: Math.round(s.price * 100),
      member_price_cents: s.memberPrice ? Math.round(s.memberPrice * 100) : null,
      rebook_interval_days: s.rebookIntervalDays,
      deposit_mode: s.depositMode,
      deposit_percent: s.depositPercent,
      deposit_flat_cents: Math.round(s.depositFlat * 100),
      online_bookable: s.onlineBookable,
      active: s.active,
      sort_order: s.sortOrder,
    };

    const { data, error } = s.id
      ? await supabase.from('services').update(payload).eq('id', s.id)
          .eq('business_id', ctx.businessId).select('id').single()
      : await supabase.from('services').insert(payload).select('id').single();

    if (error) throw error;

    // A brand new service nobody can perform is invisible. Assign every
    // bookable provider by default; the operator narrows it afterwards.
    if (!s.id && data) {
      const { data: staff } = await supabase
        .from('staff')
        .select('id')
        .eq('business_id', ctx.businessId)
        .eq('bookable', true)
        .eq('active', true);

      if (staff?.length) {
        await supabase.from('service_staff').insert(
          staff.map((row) => ({ service_id: data.id, staff_id: row.id }))
        );
      }
    }

    revalidatePath('/admin/services');
    revalidatePath('/book');
    revalidatePath('/');
    return { ok: true, data: { id: data!.id }, message: 'Service saved.' };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteService(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const supabase = createAdminClient();

    // Never hard-delete a service with history — the appointment rows point at
    // it, and losing the name would corrupt every past receipt and report.
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', id);

    if ((count ?? 0) > 0) {
      await supabase.from('services')
        .update({ active: false, online_bookable: false })
        .eq('id', id).eq('business_id', ctx.businessId);
      revalidatePath('/admin/services');
      return {
        ok: true,
        message: 'Service archived. It has booking history, so it was hidden rather than deleted.',
      };
    }

    const { error } = await supabase.from('services').delete()
      .eq('id', id).eq('business_id', ctx.businessId);
    if (error) throw error;

    revalidatePath('/admin/services');
    revalidatePath('/book');
    return { ok: true, message: 'Service deleted.' };
  } catch (err) {
    return actionError(err);
  }
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

const addonSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required.').max(120),
  description: z.string().max(500).optional(),
  durationMin: z.coerce.number().int().min(0).max(240).default(0),
  price: z.coerce.number().min(0).max(10000),
  active: z.coerce.boolean().default(true),
});

export async function saveAddon(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const raw = Object.fromEntries(formData);
    const parsed = addonSchema.safeParse({
      ...raw,
      active: raw.active === 'on' || raw.active === 'true',
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input.' };
    }
    const a = parsed.data;

    const supabase = createAdminClient();
    const payload = {
      business_id: ctx.businessId,
      name: a.name,
      description: a.description || null,
      duration_min: a.durationMin,
      price_cents: Math.round(a.price * 100),
      active: a.active,
    };

    const { data, error } = a.id
      ? await supabase.from('addons').update(payload).eq('id', a.id)
          .eq('business_id', ctx.businessId).select('id').single()
      : await supabase.from('addons').insert(payload).select('id').single();

    if (error) throw error;

    // Offer a new add-on on every service by default — an add-on attached to
    // nothing can never be sold, and that is the commonest setup mistake.
    if (!a.id && data) {
      const { data: services } = await supabase
        .from('services').select('id')
        .eq('business_id', ctx.businessId).eq('active', true);

      if (services?.length) {
        await supabase.from('service_addons').insert(
          services.map((s) => ({ service_id: s.id, addon_id: data.id }))
        );
      }
    }

    revalidatePath('/admin/services');
    revalidatePath('/book');
    return { ok: true, message: 'Add-on saved.' };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteAddon(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const supabase = createAdminClient();
    const { count } = await supabase
      .from('appointment_addons')
      .select('id', { count: 'exact', head: true })
      .eq('addon_id', id);

    if ((count ?? 0) > 0) {
      await supabase.from('addons').update({ active: false })
        .eq('id', id).eq('business_id', ctx.businessId);
      revalidatePath('/admin/services');
      return { ok: true, message: 'Add-on archived — it has sales history.' };
    }

    await supabase.from('addons').delete()
      .eq('id', id).eq('business_id', ctx.businessId);
    revalidatePath('/admin/services');
    return { ok: true, message: 'Add-on deleted.' };
  } catch (err) {
    return actionError(err);
  }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

const staffSchema = z.object({
  id: z.string().uuid().optional(),
  displayName: z.string().min(1, 'Name is required.').max(120),
  title: z.string().max(80).optional(),
  bio: z.string().max(1000).optional(),
  email: z.string().email('Enter a valid email.').or(z.literal('')).optional(),
  phone: z.string().max(40).optional(),
  role: z.enum(['owner', 'manager', 'front_desk', 'provider', 'read_only']).default('provider'),
  bookable: z.coerce.boolean().default(true),
  priceMultiplier: z.coerce.number().min(0.1).max(5).default(1),
  color: z.string().max(20).optional(),
  active: z.coerce.boolean().default(true),
  avatarUrl: z.string().optional(),
});

export async function saveStaff(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const raw = Object.fromEntries(formData);
    const parsed = staffSchema.safeParse({
      ...raw,
      bookable: raw.bookable === 'on' || raw.bookable === 'true',
      active: raw.active === 'on' || raw.active === 'true',
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input.' };
    }
    const s = parsed.data;

    // Only an owner can mint another owner, or a manager would be able to
    // promote themselves past the person who hired them.
    if (s.role === 'owner' && ctx.role !== 'owner') {
      return { ok: false, error: 'Only the account owner can grant owner access.' };
    }

    const supabase = createAdminClient();
    const payload = {
      business_id: ctx.businessId,
      display_name: s.displayName,
      title: s.title || null,
      bio: s.bio || null,
      email: s.email || null,
      phone: s.phone || null,
      role: s.role,
      bookable: s.bookable,
      price_multiplier: s.priceMultiplier,
      color: s.color || null,
      active: s.active,
      avatar_url: s.avatarUrl || null,
    };

    const { data, error } = s.id
      ? await supabase.from('staff').update(payload).eq('id', s.id)
          .eq('business_id', ctx.businessId).select('id').single()
      : await supabase.from('staff').insert(payload).select('id').single();

    if (error) throw error;

    if (!s.id && data) {
      const { data: location } = await supabase
        .from('locations').select('id')
        .eq('business_id', ctx.businessId).eq('active', true)
        .order('sort_order').limit(1).maybeSingle();

      if (location) {
        await supabase.from('staff_locations')
          .insert({ staff_id: data.id, location_id: location.id });
      }

      // A bookable provider who performs nothing can never be booked.
      if (s.bookable) {
        const { data: services } = await supabase
          .from('services').select('id')
          .eq('business_id', ctx.businessId).eq('active', true);

        if (services?.length) {
          await supabase.from('service_staff').insert(
            services.map((svc) => ({ service_id: svc.id, staff_id: data.id }))
          );
        }
      }
    }

    revalidatePath('/admin/staff');
    revalidatePath('/book');
    revalidatePath('/');
    return { ok: true, message: 'Saved.' };
  } catch (err) {
    return actionError(err);
  }
}

/** Replace a provider's whole weekly schedule in one transaction-ish sweep. */
export async function saveStaffSchedule(
  staffId: string,
  shifts: Array<{ weekday: number; start: string; end: string }>
): Promise<ActionResult> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const supabase = createAdminClient();

    const { data: staff } = await supabase
      .from('staff').select('id')
      .eq('id', staffId).eq('business_id', ctx.businessId).maybeSingle();
    if (!staff) return { ok: false, error: 'Provider not found.' };

    const { data: location } = await supabase
      .from('locations').select('id')
      .eq('business_id', ctx.businessId).eq('active', true)
      .order('sort_order').limit(1).maybeSingle();
    if (!location) return { ok: false, error: 'No active location.' };

    for (const shift of shifts) {
      if (shift.end <= shift.start) {
        return { ok: false, error: 'A shift must end after it starts.' };
      }
    }

    await supabase.from('staff_schedules').delete().eq('staff_id', staffId);

    if (shifts.length) {
      const { error } = await supabase.from('staff_schedules').insert(
        shifts.map((shift) => ({
          staff_id: staffId,
          location_id: location.id,
          weekday: shift.weekday,
          start_time: shift.start,
          end_time: shift.end,
          // Backdated so historical utilization reports have a denominator.
          effective_from: new Date(Date.now() - 365 * 86_400_000)
            .toISOString().slice(0, 10),
        }))
      );
      if (error) throw error;
    }

    revalidatePath('/admin/staff');
    revalidatePath('/admin/calendar');
    revalidatePath('/book');
    return { ok: true, message: 'Schedule saved.' };
  } catch (err) {
    return actionError(err);
  }
}

// ---------------------------------------------------------------------------
// Location hours
// ---------------------------------------------------------------------------

export async function saveHours(
  locationId: string,
  hours: Array<{ weekday: number; open: string; close: string; closed: boolean }>
): Promise<ActionResult> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    for (const day of hours) {
      if (!day.closed && day.close <= day.open) {
        return { ok: false, error: 'Closing time must be after opening time.' };
      }
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('locations')
      .update({ hours })
      .eq('id', locationId)
      .eq('business_id', ctx.businessId);

    if (error) throw error;

    revalidatePath('/admin/settings');
    revalidatePath('/book');
    revalidatePath('/');
    return { ok: true, message: 'Hours saved.' };
  } catch (err) {
    return actionError(err);
  }
}

const locationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(60).optional(),
  postalCode: z.string().max(20).optional(),
  timezone: z.string().max(60).optional(),
});

export async function saveLocation(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const parsed = locationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input.' };
    }
    const l = parsed.data;

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('locations')
      .update({
        name: l.name,
        phone: l.phone || null,
        email: l.email || null,
        address_line1: l.addressLine1 || null,
        city: l.city || null,
        region: l.region || null,
        postal_code: l.postalCode || null,
        timezone: l.timezone || null,
      })
      .eq('id', l.id)
      .eq('business_id', ctx.businessId);

    if (error) throw error;

    revalidatePath('/', 'layout');
    return { ok: true, message: 'Location saved.' };
  } catch (err) {
    return actionError(err);
  }
}

// ---------------------------------------------------------------------------
// Vertical preset import
// ---------------------------------------------------------------------------

/**
 * Load a vertical's whole starter catalog into the database.
 *
 * This is what turns the setup wizard from a form into a shortcut: picking
 * "Hair Salon" writes six services with sensible durations, processing gaps,
 * and rebooking intervals, four add-ons, two membership plans, and the retail
 * lineup — all editable afterwards. Building that by hand is an afternoon.
 */
export async function importVerticalPreset(
  verticalKey: string,
  options: { services: boolean; addons: boolean; plans: boolean; products: boolean }
): Promise<ActionResult<{ created: Record<string, number> }>> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const preset: VerticalPreset | undefined = verticals[verticalKey as VerticalKey];
    if (!preset) return { ok: false, error: 'Unknown business type.' };

    const supabase = createAdminClient();
    const created: Record<string, number> = {
      services: 0, addons: 0, plans: 0, products: 0,
    };

    // --- Categories + services -------------------------------------------
    const serviceIds: string[] = [];

    if (options.services) {
      const categoryNames = [...new Set(preset.seedServices.map((s) => s.category))];
      const categoryIds = new Map<string, string>();

      for (const [index, name] of categoryNames.entries()) {
        const { data: existing } = await supabase
          .from('service_categories').select('id')
          .eq('business_id', ctx.businessId).eq('name', name).maybeSingle();

        if (existing) {
          categoryIds.set(name, existing.id);
          continue;
        }

        const { data } = await supabase
          .from('service_categories')
          .insert({ business_id: ctx.businessId, name, sort_order: index })
          .select('id').single();
        if (data) categoryIds.set(name, data.id);
      }

      for (const [index, s] of preset.seedServices.entries()) {
        const processing = s.processingMin ?? 0;
        const finish = processing > 0 ? Math.max(Math.round(processing * 0.6), 10) : 0;
        const slug = slugify(s.name);

        // Idempotent: re-running the import must not duplicate the menu.
        const { data: existing } = await supabase
          .from('services').select('id')
          .eq('business_id', ctx.businessId).eq('slug', slug).maybeSingle();
        if (existing) {
          serviceIds.push(existing.id);
          continue;
        }

        const { data } = await supabase.from('services').insert({
          business_id: ctx.businessId,
          category_id: categoryIds.get(s.category) ?? null,
          name: s.name,
          slug,
          description: null,
          duration_min: s.durationMin,
          processing_time_min: processing,
          finish_time_min: finish,
          price_cents: s.priceCents,
          member_price_cents: Math.round(s.priceCents * 0.9),
          rebook_interval_days: s.rebookIntervalDays,
          deposit_mode: s.priceCents >= 15000 ? 'percent' : 'none',
          deposit_percent: 25,
          sort_order: index,
        }).select('id').single();

        if (data) {
          serviceIds.push(data.id);
          created.services++;
        }
      }

      // Everyone bookable can perform everything, until narrowed.
      const { data: staff } = await supabase
        .from('staff').select('id')
        .eq('business_id', ctx.businessId).eq('bookable', true).eq('active', true);

      if (staff?.length && serviceIds.length) {
        await supabase.from('service_staff').upsert(
          serviceIds.flatMap((serviceId) =>
            staff.map((row) => ({ service_id: serviceId, staff_id: row.id }))
          ),
          { onConflict: 'service_id,staff_id', ignoreDuplicates: true }
        );
      }
    }

    // --- Add-ons ----------------------------------------------------------
    if (options.addons) {
      for (const [index, a] of preset.seedAddons.entries()) {
        const { data: existing } = await supabase
          .from('addons').select('id')
          .eq('business_id', ctx.businessId).eq('name', a.name).maybeSingle();
        if (existing) continue;

        const { data } = await supabase.from('addons').insert({
          business_id: ctx.businessId,
          name: a.name,
          duration_min: a.durationMin,
          price_cents: a.priceCents,
          member_price_cents: Math.round(a.priceCents * 0.9),
          sort_order: index,
        }).select('id').single();

        if (data) {
          created.addons++;
          const { data: allServices } = await supabase
            .from('services').select('id')
            .eq('business_id', ctx.businessId).eq('active', true);

          if (allServices?.length) {
            await supabase.from('service_addons').upsert(
              allServices.map((s) => ({
                service_id: s.id,
                addon_id: data.id,
                is_recommended: index === 0,
                sort_order: index,
              })),
              { onConflict: 'service_id,addon_id', ignoreDuplicates: true }
            );
          }
        }
      }
    }

    // --- Membership plans -------------------------------------------------
    if (options.plans) {
      for (const [index, p] of preset.seedMembershipPlans.entries()) {
        const slug = slugify(p.name);
        const { data: existing } = await supabase
          .from('membership_plans').select('id')
          .eq('business_id', ctx.businessId).eq('slug', slug).maybeSingle();
        if (existing) continue;

        const { error } = await supabase.from('membership_plans').insert({
          business_id: ctx.businessId,
          name: p.name,
          slug,
          pitch: p.pitch,
          description: p.pitch,
          price_cents: p.priceCents,
          billing_interval: p.interval,
          included_credits: p.includedVisits,
          discount_pct: p.discountPct,
          retail_discount_pct: p.discountPct,
          perks: [
            p.includedVisits > 0
              ? `${p.includedVisits} included ${p.includedVisits === 1 ? preset.visitNoun : preset.visitNounPlural} each month`
              : 'Member pricing on every visit',
            `${p.discountPct}% off all additional services`,
            `${p.discountPct}% off retail`,
            'Unused visits roll over for 3 months',
            'No deposit required',
          ],
          sort_order: index,
        });
        if (!error) created.plans++;
      }
    }

    // --- Retail -----------------------------------------------------------
    if (options.products) {
      for (const [index, p] of preset.seedProducts.entries()) {
        const { data: existing } = await supabase
          .from('products').select('id')
          .eq('business_id', ctx.businessId).eq('name', p.name).maybeSingle();
        if (existing) continue;

        const { error } = await supabase.from('products').insert({
          business_id: ctx.businessId,
          name: p.name,
          price_cents: p.priceCents,
          member_price_cents: Math.round(p.priceCents * 0.9),
          sort_order: index,
        });
        if (!error) created.products++;
      }
    }

    revalidatePath('/admin/services');
    revalidatePath('/book');
    revalidatePath('/');

    return {
      ok: true,
      data: { created },
      message:
        `Imported ${created.services} services, ${created.addons} add-ons, ` +
        `${created.plans} plans, and ${created.products} products.`,
    };
  } catch (err) {
    return actionError(err);
  }
}

/** Marks onboarding done so the wizard stops being the landing screen. */
export async function completeOnboarding(): Promise<ActionResult> {
  try {
    const ctx = await requireStaff('manager');
    if (ctx.demo) return { ok: false, error: DEMO_ERROR };

    const supabase = createAdminClient();
    await supabase
      .from('businesses')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', ctx.businessId);

    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
