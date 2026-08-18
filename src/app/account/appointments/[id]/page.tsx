import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { loadBrand } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/demo';
import { resolveRules } from '@/lib/rules';
import { evaluateCancellation, evaluateReschedule } from '@/lib/booking/cancellation';
import { vertical } from '@/config/verticals';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Alert, Button } from '@/components/ui';
import { ManageAppointment } from '@/components/booking/ManageAppointment';

export const metadata = { title: 'Manage appointment' };
export const dynamic = 'force-dynamic';

export default async function ManageAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { brand, timezone, currency } = await loadBrand();

  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteHeader />
        <main id="main" className="mx-auto max-w-lg px-4 py-12">
          <Alert tone="warning" title="Demo mode">
            Managing a booking needs a database. Connect Supabase — see{' '}
            <code>SETUP.md</code>.
          </Alert>
        </main>
      </>
    );
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from('appointments')
    .select(`
      *,
      clients(id, user_id, first_name, last_name),
      services(id, name, duration_min, rebook_interval_days),
      staff(id, display_name),
      appointment_addons(name_snapshot, price_cents)
    `)
    .eq('id', id)
    .maybeSingle();

  if (!appointment) notFound();

  const client = appointment.clients as unknown as {
    id: string; user_id: string | null; first_name: string; last_name: string | null;
  } | null;

  // A signed-in user may only manage their own bookings. Someone arriving from
  // a reminder link without an account is allowed through on the appointment
  // id alone — requiring a login here is how a cancellation becomes a no-show.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && client?.user_id && client.user_id !== user.id) {
    notFound();
  }

  const { data: business } = await admin
    .from('businesses')
    .select('policy')
    .eq('id', appointment.business_id)
    .single();
  const rules = resolveRules(business?.policy);

  const service = appointment.services as unknown as {
    id: string; name: string; duration_min: number; rebook_interval_days: number;
  };
  const staffRow = appointment.staff as unknown as { id: string; display_name: string } | null;
  const addons = (appointment.appointment_addons as unknown as Array<{
    name_snapshot: string; price_cents: number;
  }>) ?? [];

  const ctx = {
    startsAt: appointment.starts_at,
    servicePriceCents: appointment.price_cents,
    addonsCents: appointment.addons_cents,
    depositCents: appointment.deposit_cents,
    depositPaidAt: appointment.deposit_paid_at,
    rescheduleCount: appointment.reschedule_count,
    isMember: false,
    initiatedBy: 'client' as const,
  };

  const cancellation = evaluateCancellation(ctx, rules);
  const reschedule = evaluateReschedule(ctx, rules);

  const isOpen = ['requested', 'booked', 'confirmed'].includes(appointment.status);

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-lg px-4 py-8">
        {!isOpen ? (
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-bold">
              This {vertical.visitNoun} is {statusWord(appointment.status)}
            </h1>
            <p className="text-[var(--color-muted)]">
              Nothing more to do here. Book a new one any time.
            </p>
            <Link href="/book">
              <Button size="lg">{brand.copy.bookCta}</Button>
            </Link>
          </div>
        ) : (
          <ManageAppointment
            appointment={{
              id: appointment.id,
              serviceId: service.id,
              serviceName: service.name,
              staffId: staffRow?.id ?? null,
              staffName: staffRow?.display_name ?? null,
              startsAt: appointment.starts_at,
              endsAt: appointment.ends_at,
              status: appointment.status,
              priceCents: appointment.price_cents,
              addonsCents: appointment.addons_cents,
              addons: addons.map((a) => ({ name: a.name_snapshot, priceCents: a.price_cents })),
              clientFirstName: client?.first_name ?? 'there',
            }}
            policy={{
              freeCancellationHours: rules.cancellation.freeCancellationHours,
              rescheduleFirst: rules.cancellation.rescheduleFirst,
              cancellationFeeCents: cancellation.feeCents,
              cancellationExplanation: cancellation.feeExplanation,
              cancellationIsFree: cancellation.isFree,
              rescheduleFeeCents: reschedule.feeCents,
              rescheduleIsFree: reschedule.isFree,
              rescheduleExplanation: reschedule.explanation,
              freeReschedulesLeft: reschedule.freeReschedulesLeft,
            }}
            timezone={timezone}
            currency={currency}
            visitNoun={vertical.visitNoun}
            phone={brand.contact.phone}
          />
        )}
      </main>
    </>
  );
}

function statusWord(status: string): string {
  return {
    cancelled: 'cancelled', completed: 'complete', no_show: 'closed',
    rescheduled: 'been moved', checked_in: 'checked in', in_progress: 'in progress',
  }[status] ?? status;
}
