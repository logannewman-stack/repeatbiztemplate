import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff, NotAuthorizedError } from '@/lib/admin/auth';
import { dispatch } from '@/lib/retention/dispatch';

const bodySchema = z.object({
  status: z.enum([
    'booked', 'confirmed', 'checked_in', 'in_progress', 'completed', 'no_show',
  ]),
});

/**
 * Move an appointment through its lifecycle from the calendar.
 *
 * Cancellation is deliberately NOT here — it has fee consequences and lives on
 * its own route, which quotes the charge before applying it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let ctx;
  try {
    ctx = await requireStaff();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof NotAuthorizedError ? err.message : 'Not authorized.' },
      { status: 403 }
    );
  }
  if (ctx.demo) {
    return NextResponse.json(
      { error: 'Demo mode — connect Supabase to update appointments.' },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, status, client_id, business_id')
    .eq('id', id)
    .eq('business_id', ctx.businessId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { status } = parsed.data;

  const timestamps: Record<string, Record<string, string | null>> = {
    confirmed: { confirmed_at: now },
    checked_in: { checked_in_at: now },
    in_progress: { started_at: now },
    completed: { completed_at: now },
    no_show: { no_show_at: now },
  };

  const { error } = await supabase
    .from('appointments')
    .update({ status, ...(timestamps[status] ?? {}) })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
  }

  await supabase.from('audit_log').insert({
    business_id: ctx.businessId,
    actor_staff_id: ctx.staffId,
    actor_user_id: ctx.userId,
    action: `appointment.${status}`,
    entity_type: 'appointment',
    entity_id: id,
    before: { status: appointment.status },
    after: { status },
  });

  // A no-show recovers a meaningful share of clients if the follow-up goes out
  // the same day. It must never fail the status change, though.
  if (status === 'no_show') {
    dispatch({
      businessId: ctx.businessId,
      campaignKey: 'no_show_followup',
      clientId: appointment.client_id,
      occurrence: id,
      appointmentId: id,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status });
}
