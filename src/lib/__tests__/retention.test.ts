import { describe, it, expect } from 'vitest';
import {
  evaluateCancellation, evaluateReschedule, bookingRestrictions,
} from '@/lib/booking/cancellation';
import {
  planRebooking, rebookingStatus, selectWinbackOffer, pointsForVisit,
} from '@/lib/retention/rebooking';
import {
  checkEligibility, quietHoursDeferral, dedupeKey, isAttributable,
} from '@/lib/retention/campaigns';
import { rules as baseRules } from '@/config/rules';

const NOW = new Date('2026-09-01T12:00:00Z');
const hoursFromNow = (h: number) =>
  new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe('evaluateCancellation', () => {
  const base = {
    servicePriceCents: 10000, addonsCents: 2000, depositCents: 0,
    depositPaidAt: null, rescheduleCount: 0, isMember: false,
    initiatedBy: 'client' as const, now: NOW,
  };

  it('is free outside the notice window', () => {
    const out = evaluateCancellation({ ...base, startsAt: hoursFromNow(48) }, baseRules);
    expect(out.isFree).toBe(true);
    expect(out.feeCents).toBe(0);
  });

  it('charges 25% inside 24 hours', () => {
    const out = evaluateCancellation({ ...base, startsAt: hoursFromNow(20) }, baseRules);
    expect(out.isFree).toBe(false);
    expect(out.feePercent).toBe(25);
    expect(out.feeCents).toBe(3000);      // 25% of 12000
  });

  it('charges 50% inside 12 hours', () => {
    const out = evaluateCancellation({ ...base, startsAt: hoursFromNow(6) }, baseRules);
    expect(out.feePercent).toBe(50);
    expect(out.feeCents).toBe(6000);
  });

  it('charges the full amount inside 2 hours', () => {
    const out = evaluateCancellation({ ...base, startsAt: hoursFromNow(1) }, baseRules);
    expect(out.feePercent).toBe(100);
    expect(out.feeCents).toBe(12000);
  });

  it('applies a paid deposit against the fee rather than on top of it', () => {
    const out = evaluateCancellation({
      ...base, startsAt: hoursFromNow(20),
      depositCents: 2500, depositPaidAt: '2026-08-20T00:00:00Z',
    }, baseRules);
    expect(out.feeCents).toBe(500);       // 3000 fee less the 2500 deposit
    expect(out.depositForfeited).toBe(true);
    expect(out.refundCents).toBe(0);
  });

  it('refunds the balance when the deposit exceeds the fee', () => {
    const out = evaluateCancellation({
      ...base, startsAt: hoursFromNow(20),
      depositCents: 5000, depositPaidAt: '2026-08-20T00:00:00Z',
    }, baseRules);
    expect(out.feeCents).toBe(0);
    expect(out.refundCents).toBe(2000);   // 5000 deposit less the 3000 fee
  });

  it('never charges when the business cancels', () => {
    const out = evaluateCancellation({
      ...base, startsAt: hoursFromNow(1), initiatedBy: 'staff',
      depositCents: 2500, depositPaidAt: '2026-08-20T00:00:00Z',
    }, baseRules);
    expect(out.feeCents).toBe(0);
    expect(out.refundCents).toBe(2500);
  });

  it('leads with reschedule when the policy says to', () => {
    const out = evaluateCancellation({ ...base, startsAt: hoursFromNow(20) }, baseRules);
    expect(out.shouldOfferReschedule).toBe(true);
  });
});

describe('evaluateReschedule', () => {
  const base = {
    servicePriceCents: 10000, addonsCents: 0, depositCents: 0,
    depositPaidAt: null, rescheduleCount: 0, isMember: false,
    initiatedBy: 'client' as const, now: NOW,
  };

  it('is free with adequate notice', () => {
    const out = evaluateReschedule({ ...base, startsAt: hoursFromNow(48) }, baseRules);
    expect(out.isFree).toBe(true);
    expect(out.freeReschedulesLeft).toBe(1);
  });

  it('charges once the free reschedule is spent', () => {
    const out = evaluateReschedule({
      ...base, startsAt: hoursFromNow(48), rescheduleCount: 1,
    }, baseRules);
    expect(out.isFree).toBe(false);
    expect(out.feeCents).toBe(2500);
    expect(out.freeReschedulesLeft).toBe(0);
  });

  it('charges inside the minimum notice window', () => {
    const out = evaluateReschedule({ ...base, startsAt: hoursFromNow(6) }, baseRules);
    expect(out.isFree).toBe(false);
    expect(out.feeCents).toBe(5000);
  });
});

describe('bookingRestrictions', () => {
  it('leaves a clean client alone', () => {
    const r = bookingRestrictions(
      { noShowCount: 0, lateCancelCount: 0, hasCardOnFile: false }, baseRules
    );
    expect(r.requiresCardOnFile).toBe(false);
    expect(r.blockedFromOnlineBooking).toBe(false);
  });

  it('requires a card after repeat late cancels', () => {
    const r = bookingRestrictions(
      { noShowCount: 0, lateCancelCount: 2, hasCardOnFile: false }, baseRules
    );
    expect(r.requiresCardOnFile).toBe(true);
    expect(r.requiresFullPrepay).toBe(false);
  });

  it('requires full prepay after repeat no-shows', () => {
    const r = bookingRestrictions(
      { noShowCount: 2, lateCancelCount: 0, hasCardOnFile: true }, baseRules
    );
    expect(r.requiresFullPrepay).toBe(true);
    // Still bookable online — the goal is to keep the revenue, not to punish.
    expect(r.blockedFromOnlineBooking).toBe(false);
  });
});

describe('planRebooking', () => {
  const base = {
    serviceRebookIntervalDays: 42,
    serviceRebookWindowDays: 7,
    clientAvgDaysBetweenVisits: null,
    completedVisitCount: 1,
    lastVisitAt: '2026-09-01T12:00:00Z',
    preferredStaffId: 'staff-1',
    usualHour: 14,
    hasFutureBooking: false,
    now: NOW,
  };

  it('uses the service interval for a client with little history', () => {
    const plan = planRebooking(base, baseRules);
    expect(plan.intervalSource).toBe('service_default');
    expect(plan.intervalDays).toBe(42);
    expect(plan.idealDate.toISOString().slice(0, 10)).toBe('2026-10-13');
  });

  it('prefers the client own cadence once it is established', () => {
    const plan = planRebooking({
      ...base, clientAvgDaysBetweenVisits: 30.4, completedVisitCount: 5,
    }, baseRules);
    expect(plan.intervalSource).toBe('client_history');
    expect(plan.intervalDays).toBe(30);
    expect(plan.promptHeadline).toContain('You usually');
  });

  it('never proposes a window that starts in the past', () => {
    const plan = planRebooking({
      ...base, serviceRebookIntervalDays: 2, serviceRebookWindowDays: 30,
    }, baseRules);
    expect(plan.windowStart.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
  });

  it('survives a degenerate history', () => {
    const plan = planRebooking({
      ...base, clientAvgDaysBetweenVisits: 0, completedVisitCount: 3,
    }, baseRules);
    expect(plan.intervalDays).toBeGreaterThanOrEqual(1);
  });
});

describe('rebookingStatus', () => {
  const call = (daysAgo: number, hasFuture = false) =>
    rebookingStatus({
      lastVisitAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
      expectedIntervalDays: 30,
      hasFutureBooking: hasFuture,
      now: NOW,
    }, baseRules);

  it('classifies across the cadence', () => {
    expect(call(10).status).toBe('not_due');
    expect(call(27).status).toBe('due_soon');
    expect(call(31).status).toBe('due');
    expect(call(40).status).toBe('overdue');
    expect(call(65).status).toBe('lapsed');
  });

  it('treats a booked next visit as not due, however overdue', () => {
    expect(call(120, true).status).toBe('not_due');
  });

  it('gives up past the horizon', () => {
    expect(call(400).status).toBe('gone');
  });

  it('reports never-visited clients as not due', () => {
    const s = rebookingStatus({
      lastVisitAt: null, expectedIntervalDays: 30, hasFutureBooking: false, now: NOW,
    }, baseRules);
    expect(s.status).toBe('not_due');
    expect(s.daysSinceVisit).toBeNull();
  });
});

describe('selectWinbackOffer', () => {
  it('starts with the cheapest offer', () => {
    expect(selectWinbackOffer(10, baseRules)?.kind).toBe('addon');
  });

  it('escalates with time', () => {
    expect(selectWinbackOffer(45, baseRules)?.value).toBe(15);
    expect(selectWinbackOffer(120, baseRules)?.value).toBe(25);
  });

  it('offers nothing before the first threshold', () => {
    expect(selectWinbackOffer(3, baseRules)).toBeNull();
  });

  it('stops paying to chase past the give-up horizon', () => {
    expect(selectWinbackOffer(400, baseRules)).toBeNull();
  });
});

describe('pointsForVisit', () => {
  it('awards base points plus the rebooking bonus', () => {
    const p = pointsForVisit({ spendCents: 12000, rebookedAtCheckout: true }, baseRules);
    expect(p.points).toBe(120 + 50);
    expect(p.breakdown).toHaveLength(2);
  });

  it('omits the bonus when they did not rebook', () => {
    const p = pointsForVisit({ spendCents: 12000, rebookedAtCheckout: false }, baseRules);
    expect(p.points).toBe(120);
  });
});

describe('quietHoursDeferral', () => {
  const quiet = { start: '21:00', end: '08:00' };

  it('passes a send in the middle of the day', () => {
    expect(quietHoursDeferral(new Date('2026-09-01T14:00:00'), quiet)).toBeNull();
  });

  it('defers a late-night send to the morning', () => {
    const d = quietHoursDeferral(new Date('2026-09-01T22:30:00'), quiet);
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(2);
    expect(d!.getHours()).toBe(8);
  });

  it('defers an early-morning send to later the same day', () => {
    const d = quietHoursDeferral(new Date('2026-09-01T06:00:00'), quiet);
    expect(d!.getDate()).toBe(1);
    expect(d!.getHours()).toBe(8);
  });

  it('handles a non-wrapping window', () => {
    expect(quietHoursDeferral(new Date('2026-09-01T13:00:00'),
      { start: '12:00', end: '14:00' })).not.toBeNull();
    expect(quietHoursDeferral(new Date('2026-09-01T15:00:00'),
      { start: '12:00', end: '14:00' })).toBeNull();
  });
});

describe('checkEligibility', () => {
  const campaign = {
    id: 'c1', key: 'rebook_due', channel: 'sms' as const,
    fallback_channel: 'email' as const, cooldown_days: 14,
    skip_if_future_booking: true, skip_if_lapsed_beyond_days: null,
    min_churn_risk: 0, respect_quiet_hours: true, active: true,
  };
  const client = {
    id: 'cl1', email: 'a@example.test', phone: '+15550100123',
    sms_opt_in: true, email_opt_in: true, marketing_opt_in: true,
    opted_out_at: null, archived_at: null,
  };
  const metrics = {
    has_future_booking: false, churn_risk: 50,
    last_visit_at: '2026-08-01T00:00:00Z', lifecycle: 'due' as const,
  };
  const localNow = new Date('2026-09-01T14:00:00');

  const run = (patch: Record<string, unknown> = {}) =>
    checkEligibility({
      campaign, client, metrics, lastSentAt: null, lastAnySentAt: null,
      localNow, rules: baseRules, isTransactional: false, ...patch,
    } as never);

  it('sends to an opted-in client on the preferred channel', () => {
    const r = run();
    expect(r.eligible).toBe(true);
    expect(r.channel).toBe('sms');
    expect(r.toAddress).toBe('+15550100123');
  });

  it('falls back to email when SMS is not consented', () => {
    const r = run({ client: { ...client, sms_opt_in: false } });
    expect(r.eligible).toBe(true);
    expect(r.channel).toBe('email');
  });

  it('skips a client who already rebooked', () => {
    const r = run({ metrics: { ...metrics, has_future_booking: true } });
    expect(r.eligible).toBe(false);
    expect(r.skipReason).toBe('has_future_booking');
  });

  it('respects the campaign cooldown', () => {
    const r = run({ lastSentAt: '2026-08-25T00:00:00Z' });
    expect(r.skipReason).toBe('cooldown');
  });

  it('respects the cross-campaign frequency cap', () => {
    const r = run({ lastAnySentAt: '2026-09-01T06:00:00Z' });
    expect(r.skipReason).toBe('global_frequency_cap');
  });

  it('skips a hard opt-out', () => {
    const r = run({ client: { ...client, opted_out_at: '2026-01-01T00:00:00Z' } });
    expect(r.skipReason).toBe('opted_out');
  });

  it('skips marketing without marketing consent', () => {
    const r = run({ client: { ...client, marketing_opt_in: false } });
    expect(r.skipReason).toBe('opted_out');
  });

  it('lets transactional messages through without marketing consent', () => {
    const r = run({
      client: { ...client, marketing_opt_in: false }, isTransactional: true,
    });
    expect(r.eligible).toBe(true);
  });

  it('skips when there is no way to reach the client', () => {
    const r = run({ client: { ...client, email: null, phone: null } });
    expect(r.skipReason).toBe('no_contact_method');
  });

  it('defers rather than drops during quiet hours', () => {
    const r = run({ localNow: new Date('2026-09-01T23:00:00') });
    expect(r.eligible).toBe(false);
    expect(r.skipReason).toBe('quiet_hours');
    expect(r.deferUntil).not.toBeNull();
  });

  it('ignores quiet hours for transactional sends', () => {
    const r = run({
      localNow: new Date('2026-09-01T23:00:00'), isTransactional: true,
    });
    expect(r.eligible).toBe(true);
  });

  it('honors a minimum churn-risk threshold', () => {
    const r = run({
      campaign: { ...campaign, min_churn_risk: 80 },
    });
    expect(r.skipReason).toBe('below_risk_threshold');
  });

  it('skips an inactive campaign', () => {
    const r = run({ campaign: { ...campaign, active: false } });
    expect(r.skipReason).toBe('campaign_inactive');
  });
});

describe('attribution', () => {
  it('builds a stable dedupe key', () => {
    expect(dedupeKey('rebook_due', 'client-1', '2026-09-01'))
      .toBe('rebook_due:client-1:2026-09-01');
  });

  it('credits a booking made inside the window', () => {
    expect(isAttributable('2026-09-01T12:00:00Z', '2026-09-02T09:00:00Z')).toBe(true);
  });

  it('does not credit one made outside it', () => {
    expect(isAttributable('2026-09-01T12:00:00Z', '2026-09-05T09:00:00Z')).toBe(false);
  });

  it('does not credit a booking made before the send', () => {
    expect(isAttributable('2026-09-01T12:00:00Z', '2026-08-30T09:00:00Z')).toBe(false);
  });
});
