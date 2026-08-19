import Link from 'next/link';
import type { NextVisit } from '@/lib/booking/next-visit';

/**
 * ============================================================================
 * NEXT VISIT CARD
 * ============================================================================
 * The first thing a returning client should see, and the reason they open the
 * app a second time.
 *
 * Both states exist to remove a decision:
 *
 *   upcoming — the date, and a single confirm. An unconfirmed appointment is
 *              the population that no-shows, and confirming turns a silent
 *              no-show into an early cancellation the waitlist can still use.
 *   due      — a specific date, already chosen. "When should I come back?" is
 *              a question; "Thursday the 14th?" is a yes or no.
 *
 * Actions are plain links rather than buttons with handlers so the card works
 * before hydration — it is above the fold and is the first thing tapped.
 * ============================================================================
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWhen(iso: string, timezone: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDay(ymd: string): string {
  // Midday avoids the date shifting a day either way on the timezone boundary.
  const date = new Date(`${ymd}T12:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function countdown(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;
  if (days < 14) return 'Next week';
  return `In ${Math.round(days / 7)} weeks`;
}

export function NextVisitCard({
  visit, timezone, rebookCta,
}: {
  visit: NextVisit;
  timezone: string;
  rebookCta: string;
}) {
  if (visit.kind === 'none') return null;

  if (visit.kind === 'upcoming') {
    return (
      <div className="px-4 pt-1">
        <div className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
          <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
            <span className="mt-0.5 flex size-10 shrink-0 flex-col items-center justify-center rounded-[0.7rem] bg-[var(--color-brand-soft)] leading-none text-[var(--color-brand)]">
              <span className="text-[9px] font-semibold uppercase tracking-wide">
                {MONTHS[new Date(visit.startsAt).getMonth()]}
              </span>
              <span className="mt-0.5 text-[15px] font-bold tabular-nums">
                {new Date(visit.startsAt).getDate()}
              </span>
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-brand)]">
                  {countdown(visit.daysAway)}
                </span>
                {visit.confirmed && (
                  <span className="rounded-full bg-[var(--color-success-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-success)]">
                    Confirmed
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-[17px] font-semibold leading-tight">
                {visit.serviceName}
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-[var(--color-muted)]">
                {formatWhen(visit.startsAt, timezone)}
                {visit.staffName ? ` · ${visit.staffName}` : ''}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-px bg-[var(--color-border)]">
            {visit.confirmed ? (
              <Link
                href={`/account/appointments/${visit.appointmentId}`}
                data-press="row"
                className="bg-[var(--color-surface)] px-4 py-2.5 text-center text-[15px] font-medium"
              >
                View
              </Link>
            ) : (
              <Link
                href={`/a/${visit.appointmentId}/confirm`}
                data-press="row"
                className="bg-[var(--color-surface)] px-4 py-2.5 text-center text-[15px] font-semibold text-[var(--color-brand)]"
              >
                Confirm
              </Link>
            )}
            <Link
              href={`/account/appointments/${visit.appointmentId}`}
              data-press="row"
              className="bg-[var(--color-surface)] px-4 py-2.5 text-center text-[15px] font-medium"
            >
              Reschedule
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- Due to rebook --------------------------------------------------------
  const overdue = visit.daysOverdue > 0;

  return (
    <div className="px-4 pt-1">
      <Link
        href={`/book?service=${visit.serviceId}&date=${visit.suggestedDate}`}
        data-press
        className="block overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.7rem] bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden
              fill="none" stroke="currentColor" strokeWidth={1.9}
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.6-6.4" />
              <path d="M21 3.5V10h-6.5" />
            </svg>
          </span>

          <span className="min-w-0 flex-1">
            <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-accent)]">
              {overdue
                ? `${visit.daysOverdue} ${visit.daysOverdue === 1 ? 'day' : 'days'} overdue`
                : 'Due soon'}
            </span>
            <span className="mt-0.5 block truncate text-[17px] font-semibold leading-tight">
              {rebookCta}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-[var(--color-muted)]">
              {visit.serviceName} · {formatDay(visit.suggestedDate)}
            </span>
          </span>

          <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden
            className="shrink-0 text-[var(--color-muted)] opacity-60"
            fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.2 1.2 6.6 7l-5.4 5.8" />
          </svg>
        </div>
      </Link>
    </div>
  );
}
