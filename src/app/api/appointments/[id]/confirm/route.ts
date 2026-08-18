import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Confirm an appointment from a reminder link.
 *
 * Intentionally unauthenticated: it is reached by tapping a link in an SMS,
 * and requiring a login here would collapse the confirmation rate — which is
 * the entire point of asking. The appointment id is the bearer token, and the
 * only thing this can do is mark an appointment confirmed.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: appointment } = await admin
    .from('appointments')
    .select('id, status, starts_at')
    .eq('id', id)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
  }

  if (!['booked', 'requested'].includes(appointment.status)) {
    return NextResponse.json({
      confirmed: appointment.status === 'confirmed',
      status: appointment.status,
    });
  }

  await admin
    .from('appointments')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ confirmed: true, startsAt: appointment.starts_at });
}
