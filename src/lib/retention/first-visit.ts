/**
 * ============================================================================
 * THE FIRST-VISIT SEQUENCE
 * ============================================================================
 * Which stages a brand-new client is due, given how long ago their first visit
 * was and when they are expected back.
 *
 * Kept as a pure function so the decision can be tested without a database.
 * The job around it does the reading and the sending; everything that could be
 * wrong about the timing is decided here.
 *
 * Two rules the shape enforces:
 *
 *   a stage fires once — the caller dedupes on the returned key, so running
 *   the job twice in a day, or catching up after an outage, sends nothing
 *   twice
 *
 *   a stage that is more than a few days late does not fire at all. "How is it
 *   settling?" three weeks after the visit is worse than silence; it says
 *   nobody was paying attention.
 *
 *   at most one stage fires per run, even when several came due together. A
 *   job that has been off for two days should not apologise for the delay by
 *   sending two messages at once; it should send the one that is still worth
 *   sending, which is always the latest.
 * ============================================================================
 */

import type { FirstVisitRules } from '@/config/rules';

export interface StageDecision {
  key: string;
  label: string;
  /** When this stage became due. */
  dueAt: Date;
  /** Idempotency key for the send. */
  occurrence: string;
}

export interface SequenceInput {
  rules: FirstVisitRules;
  appointmentId: string;
  /** When their first visit finished. */
  completedAt: Date;
  /** The service's rebook interval, in days. 0 when it has no opinion. */
  rebookIntervalDays: number;
  now: Date;
  /** Stages already sent, by key. */
  alreadySent?: ReadonlySet<string>;
  /** They booked again — the sequence has done its job. */
  hasFutureBooking?: boolean;
}

/**
 * How late a stage may be and still be worth sending. A day's cron that
 * missed a run should catch up; a job that has been off for a fortnight
 * should not suddenly send four messages at once.
 */
const GRACE_HOURS = 72;

const HOUR_MS = 3_600_000;

/**
 * The one stage to send now, or null.
 *
 * Singular deliberately. Several stages can come due at once — a missed run, a
 * client whose interval is short enough that the check-in and the offer land
 * on the same day — and firing them together is worse than firing the last
 * one, which by definition supersedes the others.
 */
export function stageDue(input: SequenceInput): StageDecision | null {
  const candidates = stagesDueForTesting(input);
  if (candidates.length === 0) return null;
  // Latest wins: the newer message is the more relevant one.
  return candidates.reduce((a, b) => (b.dueAt > a.dueAt ? b : a));
}

/** Every stage currently in its window. Exported so the ordering is testable. */
export function stagesDueForTesting(input: SequenceInput): StageDecision[] {
  const {
    rules, appointmentId, completedAt, rebookIntervalDays, now,
    alreadySent, hasFutureBooking,
  } = input;

  if (!rules.enabled) return [];

  // Once they have rebooked, the rest of the sequence is asking for something
  // they have already done. The thank-you and the check-in still stand — those
  // are about the visit they just had, not the next one.
  const stopSelling = hasFutureBooking === true;

  const due: StageDecision[] = [];

  for (const stage of rules.stages) {
    if (alreadySent?.has(stage.key)) continue;

    const relative = stage.relativeToInterval;
    let dueAt: Date;

    if (relative != null) {
      // A service with no interval has no opinion about when they are due
      // back, and inventing one produces nagging rather than a nudge.
      if (rebookIntervalDays <= 0) continue;
      if (stopSelling) continue;
      dueAt = new Date(
        completedAt.getTime() + rebookIntervalDays * 24 * HOUR_MS + relative * HOUR_MS
      );
    } else {
      dueAt = new Date(completedAt.getTime() + (stage.afterHours ?? 0) * HOUR_MS);
    }

    if (dueAt > now) continue;                                   // not yet
    if (now.getTime() - dueAt.getTime() > GRACE_HOURS * HOUR_MS) continue;  // too late

    due.push({
      key: stage.key,
      label: stage.label,
      dueAt,
      occurrence: `${appointmentId}:${stage.key}`,
    });
  }

  return due;
}

/**
 * Is this client inside the window where the sequence owns the conversation?
 *
 * The generic rebooking nudge and the winback both check this. Without it a
 * new client gets four sequence messages plus whatever the ordinary campaigns
 * decide to send, and the mailbox stops reading like a person.
 */
export function inFirstVisitWindow(
  rules: FirstVisitRules,
  firstVisitAt: Date | null,
  completedVisits: number,
  now: Date
): boolean {
  if (!rules.enabled || !firstVisitAt) return false;
  // Once they have been twice they are not a first-visit client any more, and
  // the ordinary cadence is the right one.
  if (completedVisits > 1) return false;

  const elapsedDays = (now.getTime() - firstVisitAt.getTime()) / (24 * HOUR_MS);
  return elapsedDays >= 0 && elapsedDays <= rules.exclusiveForDays;
}
