import { brand } from '@/config/brand';
import { vertical } from '@/config/verticals';
import { rules } from '@/config/rules';
import { Alert } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { Screen } from '@/components/app';

export const metadata = {
  title: 'Booking policies',
  description: `Booking, cancellation, and deposit policies for ${brand.name}.`,
};

/**
 * Policy text is generated from `src/config/rules.ts` so it can never drift
 * from what the software actually enforces — a policy page that contradicts
 * the code is worse than no policy page.
 */
export default function PoliciesPage() {
  const c = rules.cancellation;
  const d = rules.deposits;

  return (
    <>
      <Screen
        title={'Booking policies'}
        subtitle="The rules the booking system actually enforces, generated from the same configuration the software runs on — so they cannot drift out of date."
      ><div className="px-4">

        <Alert tone="warning" title="Template placeholder">
          <p className="mt-1">
            This page is generated from <code>src/config/rules.ts</code>. Review
            it with the business owner and, where required, their counsel before
            launch. It is not legal advice.
          </p>
        </Alert>

        {/* Collapsed by default. This page ran to 2,000px of unbroken prose,
            which is unreadable on a phone and, worse, unscannable — nobody
            reads a cancellation policy end to end, they look for the one
            clause that applies to them. */}
        <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
          <Section title="Changes and cancellations">
            <p>
              You can change or cancel any {vertical.visitNoun} free of charge up
              to <strong>{c.freeCancellationHours} hours</strong> before it starts.
            </p>
            <p>Inside that window, the following applies:</p>
            <ul className="ml-5 list-disc space-y-1">
              {[...c.feeTiers]
                .sort((a, b) => b.withinHours - a.withinHours)
                .map((tier) => (
                  <li key={tier.withinHours}>
                    Less than {tier.withinHours} hours notice —{' '}
                    <strong>{tier.feePercent}%</strong> of the service price
                  </li>
                ))}
              <li>
                Missed {vertical.visitNounPlural} without notice —{' '}
                <strong>{c.noShowFeePercent}%</strong> of the service price
              </li>
            </ul>
            <p>
              A paid deposit is applied against any fee rather than charged on top
              of it. If your deposit is larger than the fee, the difference is
              refunded.
            </p>
          </Section>

          <Section title="Rescheduling">
            <p>
              Moving a {vertical.visitNoun} is free{' '}
              {c.freeReschedulesPerAppointment === 1
                ? 'once'
                : `up to ${c.freeReschedulesPerAppointment} times`}
              , provided you give at least {c.rescheduleMinimumNoticeHours} hours
              notice. We would always rather move an appointment than lose it.
            </p>
          </Section>

          <Section title="Deposits">
            {d.enabled ? (
              <>
                <p>A deposit is held when:</p>
                <ul className="ml-5 list-disc space-y-1">
                  <li>
                    the service is {formatMoney(d.requireAboveCents)} or more, or
                    runs {d.requireAboveMinutes} minutes or longer
                  </li>
                  {d.requireForNewClients && <li>it is your first booking with us</li>}
                  <li>
                    there is a history of missed {vertical.visitNounPlural} on the
                    account
                  </li>
                </ul>
                <p>
                  Deposits are {d.defaultPercent}% of the service price and come
                  off your total. They are fully refundable with{' '}
                  {c.freeCancellationHours} hours notice.
                </p>
                {d.waiveForMembers && (
                  <p>
                    <strong>Members never pay a deposit.</strong>
                  </p>
                )}
              </>
            ) : (
              <p>We do not currently take deposits.</p>
            )}
          </Section>

          <Section title="Repeat missed appointments">
            <p>
              After {c.requireCardAfterLateCancels} late cancellations, a card on
              file is required to book online. After {c.prepayAfterNoShows} missed{' '}
              {vertical.visitNounPlural}, online bookings are prepaid in full.
              Prepayment is still fully refundable with adequate notice — the
              point is to protect the time, not to penalize you.
            </p>
          </Section>

          <Section title="Reminders and messages">
            <p>
              We send booking confirmations and reminders{' '}
              {rules.reminders.scheduleHoursBefore.map((h) => `${h} hours`).join(', ')}{' '}
              before your {vertical.visitNoun}. These are part of your booking and
              are sent whether or not you opt into marketing.
            </p>
            <p>
              Marketing messages — offers and reminders that you are due for a
              visit — are only sent if you opt in, never between{' '}
              {rules.reminders.quietHours.start} and {rules.reminders.quietHours.end},
              and you can opt out at any time by replying STOP or using the link
              in any email.
            </p>
          </Section>

          <Section title="Late arrival">
            <p>
              We hold your full {vertical.visitNoun} time where we can. If you
              arrive late we may need to shorten the service so the{' '}
              {vertical.clientNoun} after you is not affected, and the full price
              still applies.
            </p>
          </Section>

          <Section title="Questions">
            <p>
              Call us at{' '}
              <a href={`tel:${brand.contact.phone.replace(/\D/g, '')}`} className="underline">
                {brand.contact.phone}
              </a>{' '}
              or email{' '}
              <a href={`mailto:${brand.contact.email}`} className="underline">
                {brand.contact.email}
              </a>
              . We would rather sort something out than charge a fee.
            </p>
          </Section>
        </div>
      </div></Screen>
    </>
  );
}

/**
 * One collapsible clause.
 *
 * Built on <details> rather than React state so it works before hydration and
 * keeps the browser's own find-in-page and accessibility behaviour — a policy
 * page is exactly where someone will use ⌘F for the word "cancel".
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-[var(--color-border)] last:border-b-0">
      <summary
        data-press="row"
        className="flex min-h-[var(--tap-min)] cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors active:bg-[var(--color-surface-2)] [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0 flex-1 text-[17px] font-medium">{title}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" aria-hidden
          className="shrink-0 text-[var(--color-muted)] transition-transform duration-200 group-open:rotate-90"
          fill="none" stroke="currentColor" strokeWidth={2.6}
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M8 4l8 8-8 8" />
        </svg>
      </summary>

      <div className="space-y-2 px-4 pb-4 text-[15px] leading-snug text-[var(--color-muted)]">
        {children}
      </div>
    </details>
  );
}
