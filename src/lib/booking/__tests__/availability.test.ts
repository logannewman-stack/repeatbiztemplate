import { describe, it, expect } from 'vitest';
import {
  computeAvailability,
  buildTimeline,
  busyWindowsFor,
  parseRange,
  zonedTimeToUtc,
  utcToZonedDateString,
  zonedWeekday,
  dedupeByTime,
  pickSuggestedSlot,
} from '../availability';
import type { AvailabilityInput } from '../types';

const TZ = 'America/New_York';

// 2026-09-01 is a Tuesday.
const BASE: AvailabilityInput = {
  service: {
    id: 'svc-1',
    duration_min: 60,
    processing_time_min: 0,
    finish_time_min: 0,
    buffer_before_min: 0,
    buffer_after_min: 0,
    price_cents: 10000,
    required_room_kind: null,
    max_per_day: null,
  },
  staff: [
    { id: 'staff-1', display_name: 'Provider One', price_multiplier: 1, buffer_after_min: null },
  ],
  schedules: [
    {
      staff_id: 'staff-1', weekday: 2,
      start_time: '09:00:00', end_time: '17:00:00',
      effective_from: '2020-01-01', effective_to: null,
    },
  ],
  unavailable: [],
  busy: [],
  location: {
    id: 'loc-1',
    timezone: TZ,
    hours: [{ weekday: 2, open: '09:00', close: '17:00', closed: false }] as never,
    hour_overrides: [] as never,
  },
  businessTimezone: TZ,
  rooms: [],
  fromDate: '2026-09-01',
  toDate: '2026-09-01',
  rules: {
    slotIntervalMinutes: 30,
    minLeadTimeMinutes: 0,
    maxAdvanceBookingDays: 365,
    defaultBufferBeforeMinutes: 0,
    defaultBufferAfterMinutes: 0,
    allowProcessingTimeOverlap: true,
  },
  now: new Date('2026-08-01T12:00:00Z'),
};

function withOverrides(patch: Partial<AvailabilityInput>): AvailabilityInput {
  return { ...BASE, ...patch };
}

describe('timezone helpers', () => {
  it('converts wall-clock to UTC across a DST boundary', () => {
    // EDT (UTC-4) in September.
    expect(zonedTimeToUtc('2026-09-01', '09:00', TZ).toISOString())
      .toBe('2026-09-01T13:00:00.000Z');
    // EST (UTC-5) in January.
    expect(zonedTimeToUtc('2026-01-15', '09:00', TZ).toISOString())
      .toBe('2026-01-15T14:00:00.000Z');
  });

  it('round-trips a date string', () => {
    const utc = zonedTimeToUtc('2026-09-01', '23:30', TZ);
    expect(utcToZonedDateString(utc, TZ)).toBe('2026-09-01');
  });

  it('reports the correct weekday in the location timezone', () => {
    expect(zonedWeekday('2026-09-01', TZ)).toBe(2); // Tuesday
    expect(zonedWeekday('2026-09-06', TZ)).toBe(0); // Sunday
  });
});

describe('parseRange', () => {
  it('parses a PostgREST tstzrange', () => {
    const r = parseRange('["2026-09-01 10:00:00+00","2026-09-01 11:00:00+00")');
    expect(r).not.toBeNull();
    expect(new Date(r!.from).toISOString()).toBe('2026-09-01T10:00:00.000Z');
    expect(new Date(r!.to).toISOString()).toBe('2026-09-01T11:00:00.000Z');
  });

  it('returns null on malformed input', () => {
    expect(parseRange('not a range')).toBeNull();
  });
});

describe('service timeline', () => {
  const rules = BASE.rules;

  it('treats a simple service as one solid block', () => {
    const t = buildTimeline(
      { ...BASE.service, duration_min: 60 } as never, null, rules
    );
    expect(t.hasGap).toBe(false);
    const w = busyWindowsFor(0, t);
    expect(w).toHaveLength(1);
    expect(w[0].to - w[0].from).toBe(60 * 60_000);
  });

  it('splits a service with a processing gap into two provider blocks', () => {
    const t = buildTimeline(
      {
        ...BASE.service,
        duration_min: 90, processing_time_min: 25, finish_time_min: 20,
      } as never, null, rules
    );
    expect(t.hasGap).toBe(true);
    expect(t.initialMin).toBe(45);
    const w = busyWindowsFor(0, t);
    expect(w).toHaveLength(2);
    expect(w[0].from).toBe(0);
    expect(w[0].to).toBe(45 * 60_000);          // works 45 min
    expect(w[1].from).toBe(70 * 60_000);        // free for 25
    expect(w[1].to).toBe(90 * 60_000);          // finishes the last 20
  });

  it('ignores a gap that would consume the whole service', () => {
    const t = buildTimeline(
      { ...BASE.service, duration_min: 30, processing_time_min: 40, finish_time_min: 10 } as never,
      null, rules
    );
    expect(t.hasGap).toBe(false);
    expect(t.initialMin).toBe(30);
  });

  it('resolves buffers service -> provider -> business default', () => {
    expect(buildTimeline({ ...BASE.service, buffer_after_min: 20 } as never, 5,
      { ...rules, defaultBufferAfterMinutes: 10 }).bufferAfterMin).toBe(20);
    expect(buildTimeline({ ...BASE.service, buffer_after_min: null } as never, 5,
      { ...rules, defaultBufferAfterMinutes: 10 }).bufferAfterMin).toBe(5);
    expect(buildTimeline({ ...BASE.service, buffer_after_min: null } as never, null,
      { ...rules, defaultBufferAfterMinutes: 10 }).bufferAfterMin).toBe(10);
  });
});

describe('computeAvailability', () => {
  it('generates slots across the shift, stopping so the service fits', () => {
    const [day] = computeAvailability(BASE);
    expect(day.date).toBe('2026-09-01');
    // 09:00-17:00, 60-min service, 30-min grid => 09:00 ... 16:00 = 15 slots.
    expect(day.slots).toHaveLength(15);
    expect(day.slots[0].startsAt).toBe('2026-09-01T13:00:00.000Z');  // 09:00 EDT
    expect(day.slots.at(-1)!.startsAt).toBe('2026-09-01T20:00:00.000Z'); // 16:00 EDT
  });

  it('marks a closed day closed', () => {
    const result = computeAvailability(withOverrides({
      fromDate: '2026-09-06', toDate: '2026-09-06',   // Sunday, no hours entry
    }));
    expect(result[0].closedReason).toBe('closed');
    expect(result[0].slots).toHaveLength(0);
  });

  it('removes slots that collide with an existing booking', () => {
    const result = computeAvailability(withOverrides({
      busy: [{
        staff_id: 'staff-1', room_id: null,
        // 10:00-11:00 EDT
        block: '["2026-09-01 14:00:00+00","2026-09-01 15:00:00+00")',
      }],
    }));
    const starts = result[0].slots.map((s) => s.startsAt);
    expect(starts).not.toContain('2026-09-01T13:30:00.000Z'); // 09:30 would run into it
    expect(starts).not.toContain('2026-09-01T14:00:00.000Z'); // 10:00 exact overlap
    expect(starts).toContain('2026-09-01T13:00:00.000Z');     // 09:00 finishes at 10:00
    expect(starts).toContain('2026-09-01T15:00:00.000Z');     // 11:00 starts as it ends
  });

  it('honors time off', () => {
    const result = computeAvailability(withOverrides({
      unavailable: [{
        staffId: 'staff-1',
        from: '2026-09-01T17:00:00Z', to: '2026-09-01T18:00:00Z', // 13:00-14:00 EDT
      }],
    }));
    const starts = result[0].slots.map((s) => s.startsAt);
    expect(starts).not.toContain('2026-09-01T17:00:00.000Z');
    expect(starts).toContain('2026-09-01T18:00:00.000Z');
  });

  it('honors a business-wide closure (null staff)', () => {
    const result = computeAvailability(withOverrides({
      unavailable: [{
        staffId: null,
        from: '2026-09-01T13:00:00Z', to: '2026-09-01T21:00:00Z',
      }],
    }));
    expect(result[0].slots).toHaveLength(0);
    expect(result[0].closedReason).toBe('fully_booked');
  });

  it('respects minimum lead time', () => {
    const result = computeAvailability(withOverrides({
      now: new Date('2026-09-01T13:00:00Z'),   // 09:00 EDT, the shift start
      rules: { ...BASE.rules, minLeadTimeMinutes: 120 },
    }));
    const starts = result[0].slots.map((s) => s.startsAt);
    expect(starts).not.toContain('2026-09-01T13:00:00.000Z');
    expect(starts).not.toContain('2026-09-01T14:30:00.000Z');
    expect(starts).toContain('2026-09-01T15:00:00.000Z'); // exactly 2h out
  });

  it('respects the booking horizon', () => {
    const result = computeAvailability(withOverrides({
      now: new Date('2026-08-01T12:00:00Z'),
      rules: { ...BASE.rules, maxAdvanceBookingDays: 7 },
    }));
    expect(result[0].closedReason).toBe('outside_window');
  });

  it('extends the horizon for members with priority booking', () => {
    const result = computeAvailability(withOverrides({
      now: new Date('2026-08-01T12:00:00Z'),
      rules: { ...BASE.rules, maxAdvanceBookingDays: 7 },
      priorityBookingDays: 60,
    }));
    expect(result[0].slots.length).toBeGreaterThan(0);
  });

  it('reports no_staff when nobody is scheduled', () => {
    const result = computeAvailability(withOverrides({ schedules: [] }));
    expect(result[0].closedReason).toBe('no_staff');
  });

  it('excludes shifts outside their effective window', () => {
    const result = computeAvailability(withOverrides({
      schedules: [{
        staff_id: 'staff-1', weekday: 2,
        start_time: '09:00:00', end_time: '17:00:00',
        effective_from: '2020-01-01', effective_to: '2026-08-01',
      }],
    }));
    expect(result[0].closedReason).toBe('no_staff');
  });

  it('applies the provider price multiplier', () => {
    const result = computeAvailability(withOverrides({
      staff: [{
        id: 'staff-1', display_name: 'Senior', price_multiplier: 1.2, buffer_after_min: null,
      }],
    }));
    expect(result[0].slots[0].priceCents).toBe(12000);
  });

  it('prefers an explicit per-provider price override', () => {
    const result = computeAvailability(withOverrides({
      staff: [{
        id: 'staff-1', display_name: 'Senior', price_multiplier: 1.2,
        buffer_after_min: null, priceOverrideCents: 9500,
      }],
    }));
    expect(result[0].slots[0].priceCents).toBe(9500);
  });

  it('applies buffers when checking conflicts', () => {
    const result = computeAvailability(withOverrides({
      service: { ...BASE.service, buffer_after_min: 30 },
      busy: [{
        staff_id: 'staff-1', room_id: null,
        block: '["2026-09-01 15:00:00+00","2026-09-01 16:00:00+00")', // 11:00-12:00 EDT
      }],
    }));
    const starts = result[0].slots.map((s) => s.startsAt);
    // 10:00 + 60 min + 30 min buffer runs to 11:30 — collides.
    expect(starts).not.toContain('2026-09-01T14:00:00.000Z');
    // 09:00 ends 10:00, buffer to 10:30 — fine.
    expect(starts).toContain('2026-09-01T13:00:00.000Z');
  });

  it('requires a room of the right kind when the service demands one', () => {
    const noRoom = computeAvailability(withOverrides({
      service: { ...BASE.service, required_room_kind: 'laser' },
      rooms: [{ id: 'r1', kind: 'standard', capacity: 1 }],
    }));
    expect(noRoom[0].slots).toHaveLength(0);

    const withRoom = computeAvailability(withOverrides({
      service: { ...BASE.service, required_room_kind: 'laser' },
      rooms: [{ id: 'r1', kind: 'laser', capacity: 1 }],
    }));
    expect(withRoom[0].slots.length).toBeGreaterThan(0);
    expect(withRoom[0].slots[0].roomId).toBe('r1');
  });

  it('respects room capacity', () => {
    const result = computeAvailability(withOverrides({
      service: { ...BASE.service, required_room_kind: 'laser' },
      rooms: [{ id: 'r1', kind: 'laser', capacity: 1 }],
      busy: [{
        staff_id: null, room_id: 'r1',
        block: '["2026-09-01 14:00:00+00","2026-09-01 15:00:00+00")',
      }],
    }));
    const starts = result[0].slots.map((s) => s.startsAt);
    expect(starts).not.toContain('2026-09-01T14:00:00.000Z');
  });

  it('books a short service into another appointment processing gap', () => {
    // Provider is busy 09:00-09:45 and 10:10-10:40 EDT — free in between.
    const result = computeAvailability(withOverrides({
      service: { ...BASE.service, duration_min: 25 },
      rules: { ...BASE.rules, slotIntervalMinutes: 5 },
      busy: [
        { staff_id: 'staff-1', room_id: null,
          block: '["2026-09-01 13:00:00+00","2026-09-01 13:45:00+00")' },
        { staff_id: 'staff-1', room_id: null,
          block: '["2026-09-01 14:10:00+00","2026-09-01 14:40:00+00")' },
      ],
    }));
    const starts = result[0].slots.map((s) => s.startsAt);
    expect(starts).toContain('2026-09-01T13:45:00.000Z'); // fits exactly in the gap
    expect(starts).not.toContain('2026-09-01T13:50:00.000Z'); // would overrun
  });

  it('lets a service straddle an appointment sitting inside its own gap', () => {
    // A 10-minute booking occupies 13:55-14:05.
    // The candidate service is 25 min: 10 work, 10 processing, 5 finish.
    // Starting at 13:45 the provider is busy 13:45-13:55 and 14:05-14:10 —
    // the existing booking fits exactly in the middle.
    const busy = [{
      staff_id: 'staff-1', room_id: null,
      block: '["2026-09-01 17:55:00+00","2026-09-01 18:05:00+00")',
    }];
    const service = {
      ...BASE.service, duration_min: 25, processing_time_min: 10, finish_time_min: 5,
    };

    const on = computeAvailability(withOverrides({
      service, busy,
      rules: { ...BASE.rules, slotIntervalMinutes: 5, allowProcessingTimeOverlap: true },
    }));
    expect(on[0].slots.map((s) => s.startsAt)).toContain('2026-09-01T17:45:00.000Z');

    const off = computeAvailability(withOverrides({
      service, busy,
      rules: { ...BASE.rules, slotIntervalMinutes: 5, allowProcessingTimeOverlap: false },
    }));
    // Treated as one solid 13:45-14:10 block, it now collides.
    expect(off[0].slots.map((s) => s.startsAt)).not.toContain('2026-09-01T17:45:00.000Z');
  });

  it('emits gap boundaries on a processing-gap service', () => {
    const result = computeAvailability(withOverrides({
      service: {
        ...BASE.service, duration_min: 90, processing_time_min: 25, finish_time_min: 20,
      },
    }));
    const slot = result[0].slots[0];
    expect(slot.gapStartsAt).toBe('2026-09-01T13:45:00.000Z');
    expect(slot.gapEndsAt).toBe('2026-09-01T14:10:00.000Z');
    expect(slot.busyBlocks).toHaveLength(2);
  });

  it('supports multiple providers and split shifts', () => {
    const result = computeAvailability(withOverrides({
      staff: [
        { id: 'staff-1', display_name: 'One', price_multiplier: 1, buffer_after_min: null },
        { id: 'staff-2', display_name: 'Two', price_multiplier: 1, buffer_after_min: null },
      ],
      schedules: [
        { staff_id: 'staff-1', weekday: 2, start_time: '09:00:00', end_time: '12:00:00',
          effective_from: '2020-01-01', effective_to: null },
        { staff_id: 'staff-1', weekday: 2, start_time: '14:00:00', end_time: '17:00:00',
          effective_from: '2020-01-01', effective_to: null },
        { staff_id: 'staff-2', weekday: 2, start_time: '09:00:00', end_time: '17:00:00',
          effective_from: '2020-01-01', effective_to: null },
      ],
    }));
    const staff1 = result[0].slots.filter((s) => s.staffId === 'staff-1');
    const starts1 = staff1.map((s) => s.startsAt);
    expect(starts1).toContain('2026-09-01T13:00:00.000Z');  // 09:00 first shift
    expect(starts1).not.toContain('2026-09-01T16:30:00.000Z'); // 12:30, between shifts
    expect(starts1).toContain('2026-09-01T18:00:00.000Z');  // 14:00 second shift
    expect(result[0].slots.some((s) => s.staffId === 'staff-2')).toBe(true);
  });

  it('applies a per-date hours override', () => {
    const result = computeAvailability(withOverrides({
      location: {
        ...BASE.location,
        hour_overrides: [{ date: '2026-09-01', closed: true, note: 'Holiday' }] as never,
      },
    }));
    expect(result[0].closedReason).toBe('closed');
  });
});

describe('slot selection helpers', () => {
  it('dedupes by time, preferring the requested provider', () => {
    const slots = computeAvailability(withOverrides({
      staff: [
        { id: 'staff-1', display_name: 'One', price_multiplier: 1, buffer_after_min: null },
        { id: 'staff-2', display_name: 'Two', price_multiplier: 1, buffer_after_min: null },
      ],
      schedules: [
        { staff_id: 'staff-1', weekday: 2, start_time: '09:00:00', end_time: '17:00:00',
          effective_from: '2020-01-01', effective_to: null },
        { staff_id: 'staff-2', weekday: 2, start_time: '09:00:00', end_time: '17:00:00',
          effective_from: '2020-01-01', effective_to: null },
      ],
    }))[0].slots;

    const deduped = dedupeByTime(slots, 'staff-2');
    expect(deduped).toHaveLength(15);
    expect(deduped.every((s) => s.staffId === 'staff-2')).toBe(true);
  });

  it('suggests the slot closest to the ideal return date', () => {
    const days = computeAvailability(withOverrides({
      fromDate: '2026-09-01', toDate: '2026-09-08',
      location: {
        ...BASE.location,
        hours: [
          { weekday: 1, open: '09:00', close: '17:00', closed: false },
          { weekday: 2, open: '09:00', close: '17:00', closed: false },
        ] as never,
      },
      schedules: [
        { staff_id: 'staff-1', weekday: 1, start_time: '09:00:00', end_time: '17:00:00',
          effective_from: '2020-01-01', effective_to: null },
        { staff_id: 'staff-1', weekday: 2, start_time: '09:00:00', end_time: '17:00:00',
          effective_from: '2020-01-01', effective_to: null },
      ],
    }));

    const suggested = pickSuggestedSlot(days, {
      idealDate: new Date('2026-09-08T14:00:00Z'),
      timezone: TZ,
    });
    expect(suggested).not.toBeNull();
    expect(suggested!.startsAt.slice(0, 10)).toBe('2026-09-08');
  });

  it('weights the usual provider into the suggestion', () => {
    const days = computeAvailability(withOverrides({
      staff: [
        { id: 'staff-1', display_name: 'One', price_multiplier: 1, buffer_after_min: null },
        { id: 'staff-2', display_name: 'Two', price_multiplier: 1, buffer_after_min: null },
      ],
      schedules: [
        { staff_id: 'staff-1', weekday: 2, start_time: '09:00:00', end_time: '17:00:00',
          effective_from: '2020-01-01', effective_to: null },
        { staff_id: 'staff-2', weekday: 2, start_time: '09:00:00', end_time: '17:00:00',
          effective_from: '2020-01-01', effective_to: null },
      ],
    }));

    const suggested = pickSuggestedSlot(days, {
      idealDate: new Date('2026-09-01T13:00:00Z'),
      preferStaffId: 'staff-2',
      timezone: TZ,
    });
    expect(suggested!.staffId).toBe('staff-2');
  });

  it('returns null when nothing is open', () => {
    expect(pickSuggestedSlot([{ date: '2026-09-06', slots: [] }], {
      idealDate: new Date(), timezone: TZ,
    })).toBeNull();
  });
});
