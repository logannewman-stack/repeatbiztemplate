import { createAdminClient } from '@/lib/supabase/admin';
import { loadBrand } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/demo';
import { resolveRules } from '@/lib/rules';
import { vertical } from '@/config/verticals';
import { Alert } from '@/components/ui';
import { PolicyEditor } from '@/components/admin/PolicyEditor';

export const metadata = { title: 'Policies' };
export const dynamic = 'force-dynamic';

export default async function PoliciesPage() {
  const { businessId, currency } = await loadBrand();

  let policy = resolveRules(null);
  if (isSupabaseConfigured() && businessId) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('businesses')
      .select('policy')
      .eq('id', businessId)
      .single();
    policy = resolveRules(data?.policy);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Policies</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          The rules the booking system actually enforces. The public policies
          page is generated from these, so the two can never disagree.
        </p>
      </header>

      {(!isSupabaseConfigured() || !businessId) && (
        <Alert tone="warning" title="Demo mode">
          Policy changes are stored per business. Connect Supabase to save them —
          see <code>SETUP.md</code>.
        </Alert>
      )}

      <PolicyEditor
        initial={{
          freeCancellationHours: policy.cancellation.freeCancellationHours,
          feeTiers: policy.cancellation.feeTiers,
          noShowFeePercent: policy.cancellation.noShowFeePercent,
          rescheduleFirst: policy.cancellation.rescheduleFirst,
          freeReschedulesPerAppointment: policy.cancellation.freeReschedulesPerAppointment,
          prepayAfterNoShows: policy.cancellation.prepayAfterNoShows,
          requireCardAfterLateCancels: policy.cancellation.requireCardAfterLateCancels,
          depositsEnabled: policy.deposits.enabled,
          depositPercent: policy.deposits.defaultPercent,
          depositAboveCents: policy.deposits.requireAboveCents,
          depositAboveMinutes: policy.deposits.requireAboveMinutes,
          depositNewClients: policy.deposits.requireForNewClients,
          depositWaiveMembers: policy.deposits.waiveForMembers,
          reminderHours: policy.reminders.scheduleHoursBefore,
          quietStart: policy.reminders.quietHours.start,
          quietEnd: policy.reminders.quietHours.end,
          nudgeDayOffsets: policy.rebooking.nudgeDayOffsets,
          lapseMultiplier: policy.lapse.lapseMultiplier,
          giveUpAfterDays: policy.lapse.giveUpAfterDays,
          minLeadTimeMinutes: policy.booking.minLeadTimeMinutes,
          maxAdvanceBookingDays: policy.booking.maxAdvanceBookingDays,
          slotIntervalMinutes: policy.booking.slotIntervalMinutes,
          allowProcessingTimeOverlap: policy.booking.allowProcessingTimeOverlap,
          allowPause: policy.memberships.allowPause,
          maxPauseMonths: policy.memberships.maxPauseMonths,
          creditRolloverPeriods: policy.memberships.creditRolloverPeriods,
          publicReviewUrl: policy.reviews.publicReviewUrl,
        }}
        currency={currency}
        visitNoun={vertical.visitNoun}
        clientNoun={vertical.clientNoun}
        readOnly={!isSupabaseConfigured() || !businessId}
      />
    </div>
  );
}
