import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/demo';
import { brand } from '@/config/brand';
import { vertical } from '@/config/verticals';
import { Alert, ButtonLink, Card } from '@/components/ui';
import { Screen } from '@/components/app';

export const metadata = { title: 'Confirm your appointment' };
export const dynamic = 'force-dynamic';

/**
 * Landing page for the "reply C to confirm" link in a reminder.
 *
 * Confirming happens on load rather than behind a button: the client already
 * expressed intent by tapping the link, and an extra tap here measurably
 * lowers the confirmation rate — which is the number this whole flow exists
 * to raise.
 */
export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <Alert tone="warning">Demo mode — nothing to confirm.</Alert>
      </Shell>
    );
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from('appointments')
    .select('id, status, starts_at, services(name), staff(display_name)')
    .eq('id', id)
    .maybeSingle();

  if (!appointment) {
    return (
      <Shell>
        <Alert tone="danger">
          We couldn&apos;t find that {vertical.visitNoun}. It may have been cancelled.
        </Alert>
      </Shell>
    );
  }

  if (['booked', 'requested'].includes(appointment.status)) {
    await admin
      .from('appointments')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', id);
  }

  const service = appointment.services as unknown as { name: string } | null;
  const staffRow = appointment.staff as unknown as { display_name: string } | null;
  const cancelled = ['cancelled', 'no_show'].includes(appointment.status);

  return (
    <Shell>
      {cancelled ? (
        <Alert tone="warning">
          This {vertical.visitNoun} was cancelled. Book a new one any time.
        </Alert>
      ) : (
        <>
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-2xl text-[var(--color-success)]">
            ✓
          </div>
          <h1 className="mt-4 text-2xl font-semibold">You&apos;re confirmed</h1>
          <p className="mt-2 text-[var(--color-muted)]">
            {service?.name} on{' '}
            {new Date(appointment.starts_at).toLocaleString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
            {staffRow && ` with ${staffRow.display_name}`}.
          </p>
        </>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <ButtonLink href={`/account/appointments/${id}`} fullWidth variant="secondary">
          Change or cancel
        </ButtonLink>
        <ButtonLink href="/" fullWidth variant="ghost">Back to {brand.shortName}</ButtonLink>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Screen title={'Confirm'}><div className="px-4">
      <Card className="p-6 text-center">{children}</Card>
    </div></Screen>
  );
}
