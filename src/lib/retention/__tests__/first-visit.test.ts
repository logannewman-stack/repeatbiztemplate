/**
 * Every bug in here is a message arriving at the wrong moment, which is the
 * one failure mode a retention product cannot have. A nudge three weeks late
 * is worse than no nudge — it tells the client nobody was paying attention.
 */

import { describe, it, expect } from 'vitest';
import { stageDue, stagesDueForTesting, inFirstVisitWindow } from '../first-visit';
import type { FirstVisitRules } from '@/config/rules';

const RULES: FirstVisitRules = {
  enabled: true,
  stages: [
    { key: 'thanks',   afterHours: 2,  label: 'Thanks' },
    { key: 'checkin',  afterHours: 72, label: 'Check in' },
    { key: 'rebook',   relativeToInterval: -168, label: 'Rebook' },
    { key: 'lastcall', relativeToInterval: 240,  label: 'Last call' },
  ],
  exclusiveForDays: 120,
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const VISIT = new Date('2026-03-02T15:00:00Z');

const at = (h: number) => new Date(VISIT.getTime() + h * HOUR);

/** The one stage that would actually be sent, as a single-element list. */
function due(h: number, over: Partial<Parameters<typeof stageDue>[0]> = {}) {
  const stage = stageDue({
    rules: RULES,
    appointmentId: 'appt-1',
    completedAt: VISIT,
    rebookIntervalDays: 42,
    now: at(h),
    ...over,
  });
  return stage ? [stage.key] : [];
}

/** Everything in its window, before the one-per-run rule is applied. */
function window_(h: number, over: Partial<Parameters<typeof stageDue>[0]> = {}) {
  return stagesDueForTesting({
    rules: RULES,
    appointmentId: 'appt-1',
    completedAt: VISIT,
    rebookIntervalDays: 42,
    now: at(h),
    ...over,
  }).map((s) => s.key);
}

describe('stagesDue', () => {
  it('sends nothing in the first hour', () => {
    expect(due(0.5)).toEqual([]);
  });

  it('sends the thank-you once the visit has settled, not during it', () => {
    expect(due(1.9)).toEqual([]);
    expect(due(2.1)).toEqual(['thanks']);
  });

  it('checks in on day three', () => {
    expect(due(71)).not.toContain('checkin');
    expect(due(73)).toContain('checkin');
  });

  it('offers the rebook a week before they are due, not a week after', () => {
    const back = 42 * 24;
    expect(due(back - 169)).not.toContain('rebook');
    expect(due(back - 167)).toContain('rebook');
  });

  it('makes a last call ten days past due', () => {
    const back = 42 * 24;
    expect(due(back + 239)).not.toContain('lastcall');
    expect(due(back + 241)).toContain('lastcall');
  });

  it('drops a stage more than three days late', () => {
    // A cron that missed one night catches up; a job off for a fortnight does
    // not fire a stale message at a bewildered client. Checked against the
    // window rather than what is sent, because by hour 73 the check-in has
    // also come due and supersedes it either way.
    expect(window_(2 + 71)).toContain('thanks');
    expect(window_(2 + 73)).not.toContain('thanks');
  });

  it('never repeats a stage already sent', () => {
    expect(due(80, { alreadySent: new Set(['thanks', 'checkin']) })).toEqual([]);
  });

  it('stops selling once they have rebooked, but still says thank you', () => {
    expect(due(2.1, { hasFutureBooking: true })).toEqual(['thanks']);
    const back = 42 * 24;
    expect(due(back - 167, { hasFutureBooking: true })).toEqual([]);
  });

  it('skips the interval-relative stages when the service has no interval', () => {
    const keys = due(2000, { rebookIntervalDays: 0 });
    expect(keys).not.toContain('rebook');
    expect(keys).not.toContain('lastcall');
  });

  it('still thanks and checks in on a service with no interval', () => {
    expect(due(2.1, { rebookIntervalDays: 0 })).toEqual(['thanks']);
    expect(due(73, { rebookIntervalDays: 0 })).toEqual(['checkin']);
  });

  it('sends at most one message per run, whenever it is run', () => {
    // Walked hour by hour across four months, this must never want to send two
    // things at once — that is the property, not an example of it.
    for (let h = 0; h < 24 * 130; h += 1) {
      expect(due(h).length).toBeLessThanOrEqual(1);
    }
  });

  it('sends nothing at all when the sequence is switched off', () => {
    expect(due(73, { rules: { ...RULES, enabled: false } })).toEqual([]);
  });

  it('gives each stage a key unique to the appointment', () => {
    const stage = stageDue({
      rules: RULES, appointmentId: 'appt-9', completedAt: VISIT,
      rebookIntervalDays: 42, now: at(2.1),
    });
    expect(stage!.occurrence).toBe('appt-9:thanks');
  });

  it('tracks a short interval as readily as a long one', () => {
    // A blowout rebooks in two weeks, a balayage in fourteen. The offer lands
    // a week before either, not a fixed number of days after the visit.
    for (const interval of [14, 28, 42, 98]) {
      expect(due(interval * 24 - 167, { rebookIntervalDays: interval })).toContain('rebook');
    }
  });

  it('sends only the latest stage when several came due together', () => {
    // A run missed by a couple of days leaves the thank-you still inside its
    // grace window alongside the check-in. Sending both would apologise for
    // the delay by doubling it.
    expect(window_(73)).toEqual(['thanks', 'checkin']);
    expect(due(73)).toEqual(['checkin']);
  });
});

describe('inFirstVisitWindow', () => {
  const now = new Date('2026-03-02T00:00:00Z');
  const ago = (d: number) => new Date(now.getTime() - d * DAY);

  it('holds the ordinary campaigns back for a new client', () => {
    expect(inFirstVisitWindow(RULES, ago(10), 1, now)).toBe(true);
  });

  it('lets them go once the client has been twice', () => {
    expect(inFirstVisitWindow(RULES, ago(10), 2, now)).toBe(false);
  });

  it('lets them go once the window has passed', () => {
    expect(inFirstVisitWindow(RULES, ago(121), 1, now)).toBe(false);
    expect(inFirstVisitWindow(RULES, ago(119), 1, now)).toBe(true);
  });

  it('holds nothing back for someone who has never visited', () => {
    expect(inFirstVisitWindow(RULES, null, 0, now)).toBe(false);
  });

  it('holds nothing back when the sequence is off', () => {
    expect(inFirstVisitWindow({ ...RULES, enabled: false }, ago(1), 1, now)).toBe(false);
  });

  it('ignores a first visit dated in the future rather than trusting it', () => {
    expect(inFirstVisitWindow(RULES, new Date(now.getTime() + DAY), 1, now)).toBe(false);
  });
});
