'use server';

/**
 * ============================================================================
 * CHECKOUT
 * ============================================================================
 * Rings up a visit and — the part that actually matters — books the next one.
 *
 * Rebooking at the chair converts several times better than any message sent
 * afterwards, so `completeCheckout` takes an optional next-visit slot and
 * books it in the same call. If that booking loses a race for the slot, the
 * sale still completes: losing the payment because a time got taken would be
 * a far worse outcome than an unbooked follow-up.
 * ============================================================================
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff, actionError, type ActionResult } from '@/lib/admin/auth';
import { resolveRules } from '@/lib/rules';
import { quote } from '@/lib/booking/pricing';
import { pointsForVisit } from '@/lib/retention/rebooking';

const lineSchema = z.object({
  kind: z.enum(['addon', 'product']),
  id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const checkoutSchema = z.object({
  appointmentId: z.string().uuid(),
  lines: z.array(lineSchema).default([]),
  tipCents: z.coerce.number().int().min(0).max(1_000_00).default(0),
  discountCents: z.coerce.number().int().min(0).default(0),
  paymentMethod: z.enum(['card', 'cash', 'gift_card', 'membership_credit', 'package', 'other'])
    .default('card'),
  useMembershipCredit: z.boolean().default(false),
  /** Next visit booked at the chair. */
  rebook: z
    .object({
      startsAt: z.string().datetime(),
      staffId: z.string().uuid().nullable(),
      serviceId: z.string().uuid(),
    })
    .nullable()
    .optional(),
});

export interface CheckoutResult {
  orderId: string;
  totalCents: number;
  pointsEarned: number;
  rebooked: boolean;
  rebookError?: string;
}

export async function completeCheckout(
  input: unknown
): Promise<ActionResult<CheckoutResult>> {
  try {
    const ctx = await requireStaff();
    if (ctx.demo) {
      return { ok: false, error: 'Demo mode — connect Supabase to take payment.' };
    }

    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid checkout.' };
    }
    const data = parsed.data;

    const supabase = createAdminClient();

    const [{ data: appointment }, { data: business }] = await Promise.all([
      supabase
        .from('appointments')
        .select('*, services(*), clients(id, first_name, stripe_customer_id)')
        .eq('id', data.appointmentId)
        .eq('business_id', ctx.businessId)
        .maybeSingle(),
      supabase
        .from('businesses')
        .select('policy, tax_rate_bps, currency')
        .eq('id', ctx.businessId)
        .single(),
    ]);

    if (!appointment) return { ok: false, error: 'Appointment not found.' };
    if (appointment.order_id) {
      return { ok: false, error: 'This visit has already been checked out.' };
    }

    const rules = resolveRules(business?.policy);
    const service = appointment.services as unknown as {
      id: string; name: string; price_cents: number; member_price_cents: number | null;
      duration_min: number; deposit_mode: 'none' | 'flat' | 'percent' | 'full';
      deposit_flat_cents: number; deposit_percent: number; taxable: boolean;
      rebook_interval_days: number;
    };

    // --- Membership context ------------------------------------------------

    const { data: membership } = await supabase
      .from('memberships')
      .select('*, membership_plans(discount_pct, retail_discount_pct, waives_deposits, credit_service_ids)')
      .eq('client_id', appointment.client_id)
      .in('status', ['active', 'trialing'])
      .maybeSingle();

    const plan = membership?.membership_plans as unknown as {
      discount_pct: number; retail_discount_pct: number;
      waives_deposits: boolean; credit_service_ids: string[];
    } | null;

    // --- Line items --------------------------------------------------------

    const addonIds = data.lines.filter((l) => l.kind === 'addon').map((l) => l.id);
    const productIds = data.lines.filter((l) => l.kind === 'product').map((l) => l.id);

    const [{ data: addons }, { data: products }] = await Promise.all([
      addonIds.length
        ? supabase.from('addons').select('*').in('id', addonIds)
        : Promise.resolve({ data: [] as never[] }),
      productIds.length
        ? supabase.from('products').select('*').in('id', productIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    const priced = quote({
      service,
      servicePriceCents: appointment.price_cents || service.price_cents,
      addons: (addons ?? []).map((a) => ({
        id: a.id, name: a.name, price_cents: a.price_cents,
        member_price_cents: a.member_price_cents, duration_min: a.duration_min,
        taxable: a.taxable, fromUpsell: true,
      })),
      products: (products ?? []).map((p) => ({
        id: p.id, name: p.name, price_cents: p.price_cents,
        member_price_cents: p.member_price_cents,
        quantity: data.lines.find((l) => l.id === p.id)?.quantity ?? 1,
        taxable: p.taxable,
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
        isNewClient: false, noShowRisk: 0, noShowCount: 0,
        lateCancelCount: 0, hasCardOnFile: false,
      },
      rules,
      taxRateBps: business?.tax_rate_bps ?? 0,
      tipCents: data.tipCents,
      useMembershipCredit: data.useMembershipCredit,
    });

    // A paid deposit is money already collected; it comes off what is owed now.
    const depositApplied = appointment.deposit_paid_at ? appointment.deposit_cents : 0;
    const dueCents = Math.max(priced.totalCents - depositApplied - data.discountCents, 0);

    // --- Order -------------------------------------------------------------

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        business_id: ctx.businessId,
        client_id: appointment.client_id,
        appointment_id: appointment.id,
        location_id: appointment.location_id,
        staff_id: appointment.staff_id,
        status: 'paid',
        subtotal_cents: priced.subtotalCents,
        discount_cents: priced.discountCents + data.discountCents,
        tax_cents: priced.taxCents,
        tip_cents: data.tipCents,
        total_cents: priced.totalCents,
        membership_credit_applied: priced.coveredByCredit ? 1 : 0,
        currency: business?.currency ?? 'USD',
        closed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (orderError || !order) throw orderError ?? new Error('Could not create the order.');

    await supabase.from('order_items').insert(
      priced.lines
        .filter((line) => line.kind !== 'tax')
        .map((line) => ({
          order_id: order.id,
          business_id: ctx.businessId,
          kind: line.kind,
          reference_id: line.referenceId,
          name_snapshot: line.name,
          quantity: line.quantity,
          unit_price_cents: line.unitPriceCents,
          total_cents: line.totalCents,
          from_upsell: line.fromUpsell,
          staff_id: appointment.staff_id,
        }))
    );

    await supabase.from('payments').insert({
      business_id: ctx.businessId,
      order_id: order.id,
      client_id: appointment.client_id,
      appointment_id: appointment.id,
      amount_cents: dueCents,
      currency: business?.currency ?? 'USD',
      status: 'succeeded',
      method: data.paymentMethod,
      purpose: 'sale',
      processed_at: new Date().toISOString(),
    });

    // --- Redeem a membership credit ---------------------------------------

    if (data.useMembershipCredit && membership && priced.coveredByCredit) {
      await supabase.rpc('redeem_membership_credit', {
        p_membership_id: membership.id,
        p_appointment_id: appointment.id,
      });
    }

    // --- Decrement retail stock -------------------------------------------

    for (const product of products ?? []) {
      if (product.stock_quantity == null) continue;
      const quantity = data.lines.find((l) => l.id === product.id)?.quantity ?? 1;
      await supabase
        .from('products')
        .update({ stock_quantity: Math.max(product.stock_quantity - quantity, 0) })
        .eq('id', product.id);
    }

    // --- Close the appointment --------------------------------------------

    await supabase
      .from('appointments')
      .update({
        status: 'completed',
        completed_at: appointment.completed_at ?? new Date().toISOString(),
        order_id: order.id,
        addons_cents: priced.lines
          .filter((l) => l.kind === 'addon')
          .reduce((sum, l) => sum + l.totalCents, 0),
      })
      .eq('id', appointment.id);

    // --- Book the next visit ----------------------------------------------

    let rebooked = false;
    let rebookError: string | undefined;

    if (data.rebook) {
      try {
        const { data: nextService } = await supabase
          .from('services')
          .select('*')
          .eq('id', data.rebook.serviceId)
          .single();

        if (nextService) {
          const startsAt = new Date(data.rebook.startsAt);
          const endsAt = new Date(startsAt.getTime() + nextService.duration_min * 60_000);

          const bufferBefore =
            nextService.buffer_before_min ?? rules.booking.defaultBufferBeforeMinutes;
          const bufferAfter =
            nextService.buffer_after_min ?? rules.booking.defaultBufferAfterMinutes;

          const hasGap =
            nextService.processing_time_min > 0 &&
            nextService.finish_time_min > 0 &&
            nextService.duration_min -
              nextService.processing_time_min -
              nextService.finish_time_min > 0;

          const initialMin = hasGap
            ? nextService.duration_min -
              nextService.processing_time_min -
              nextService.finish_time_min
            : 0;

          const { error } = await supabase.from('appointments').insert({
            business_id: ctx.businessId,
            location_id: appointment.location_id,
            client_id: appointment.client_id,
            staff_id: data.rebook.staffId ?? appointment.staff_id,
            service_id: nextService.id,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            blocks_at: new Date(startsAt.getTime() - bufferBefore * 60_000).toISOString(),
            blocks_until: new Date(endsAt.getTime() + bufferAfter * 60_000).toISOString(),
            gap_starts_at: hasGap
              ? new Date(startsAt.getTime() + initialMin * 60_000).toISOString()
              : null,
            gap_ends_at: hasGap
              ? new Date(
                  startsAt.getTime() +
                    (initialMin + nextService.processing_time_min) * 60_000
                ).toISOString()
              : null,
            duration_min: nextService.duration_min,
            status: 'booked',
            // This is the flag every rebooking metric is measured from.
            source: 'rebook_prompt',
            price_cents: nextService.price_cents,
            rebooked_from_id: appointment.id,
            created_by: ctx.staffId,
          });

          if (error) throw error;
          rebooked = true;
        }
      } catch (err) {
        // Never fail the sale over the follow-up booking.
        rebookError =
          (err as { code?: string })?.code === '23P01'
            ? 'That time was just taken — book the next visit from the calendar.'
            : 'Could not book the next visit.';
      }
    }

    // --- Loyalty -----------------------------------------------------------

    const points = pointsForVisit(
      { spendCents: priced.totalCents, rebookedAtCheckout: rebooked },
      rules
    );

    if (points.points > 0) {
      const { data: balance } = await supabase
        .from('client_metrics')
        .select('loyalty_points')
        .eq('client_id', appointment.client_id)
        .maybeSingle();

      await supabase.from('loyalty_transactions').insert({
        business_id: ctx.businessId,
        client_id: appointment.client_id,
        points: points.points,
        balance_after: (balance?.loyalty_points ?? 0) + points.points,
        reason: rebooked ? 'rebook' : 'visit',
        order_id: order.id,
        appointment_id: appointment.id,
      });
    }

    revalidatePath('/admin/calendar');
    revalidatePath('/admin/checkout');
    revalidatePath('/admin');

    return {
      ok: true,
      data: {
        orderId: order.id,
        totalCents: dueCents,
        pointsEarned: points.points,
        rebooked,
        rebookError,
      },
      message: rebooked
        ? 'Paid, and the next visit is booked.'
        : 'Payment recorded.',
    };
  } catch (err) {
    return actionError(err);
  }
}
