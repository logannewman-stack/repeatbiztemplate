import { describe, it, expect } from 'vitest';
import {
  assignLanes, localMinutes, localHour, dateInZone,
  hhmmToMinutes, formatHour, visibleHourRange,
} from '@/lib/admin/calendar-layout';

const TZ = 'America/New_York';
const minutes = (iso: string) => localMinutes(iso, TZ);

/** Build an appointment-shaped item from wall-clock UTC times. */
function slot(id: string, startUtc: string, endUtc: string) {
  return { id, startsAt: `2026-09-01T${startUtc}:00Z`, endsAt: `2026-09-01T${endUtc}:00Z` };
}

describe('assignLanes', () => {
  it('gives a single appointment the full width', () => {
    const lanes = assignLanes([slot('a', '13:00', '14:00')], minutes);
    expect(lanes.get('a')).toEqual({ index: 0, total: 1 });
  });

  it('keeps non-overlapping appointments in one lane', () => {
    const lanes = assignLanes(
      [slot('a', '13:00', '14:00'), slot('b', '14:00', '15:00')],
      minutes
    );
    expect(lanes.get('a')!.index).toBe(0);
    expect(lanes.get('b')!.index).toBe(0);
    expect(lanes.get('a')!.total).toBe(1);
  });

  it('splits two overlapping appointments across two lanes', () => {
    const lanes = assignLanes(
      [slot('a', '13:00', '14:30'), slot('b', '13:30', '15:00')],
      minutes
    );
    expect(lanes.get('a')!.index).toBe(0);
    expect(lanes.get('b')!.index).toBe(1);
    expect(lanes.get('a')!.total).toBe(2);
    expect(lanes.get('b')!.total).toBe(2);
  });

  it('handles three-deep overlap', () => {
    const lanes = assignLanes(
      [
        slot('a', '13:00', '15:00'),
        slot('b', '13:15', '15:00'),
        slot('c', '13:30', '15:00'),
      ],
      minutes
    );
    expect([...lanes.values()].map((l) => l.index).sort()).toEqual([0, 1, 2]);
    expect([...lanes.values()].every((l) => l.total === 3)).toBe(true);
  });

  it('reuses a lane once its occupant has ended', () => {
    const lanes = assignLanes(
      [
        slot('a', '13:00', '14:00'),
        slot('b', '13:30', '15:00'),
        slot('c', '14:00', '15:00'), // can reuse lane 0 — 'a' is done
      ],
      minutes
    );
    expect(lanes.get('a')!.index).toBe(0);
    expect(lanes.get('b')!.index).toBe(1);
    expect(lanes.get('c')!.index).toBe(0);
  });

  it('does not narrow an isolated appointment because of a busy earlier cluster', () => {
    // A crowded morning, then a genuine gap, then one lone afternoon booking.
    const lanes = assignLanes(
      [
        slot('a', '13:00', '15:00'),
        slot('b', '13:00', '15:00'),
        slot('c', '13:00', '15:00'),
        slot('lone', '18:00', '19:00'),
      ],
      minutes
    );
    expect(lanes.get('a')!.total).toBe(3);
    // The lone booking should still be full width, not one third of a column.
    expect(lanes.get('lone')).toEqual({ index: 0, total: 1 });
  });

  it('treats touching appointments as non-overlapping', () => {
    // 13:00–14:00 and 14:00–15:00 share an instant but not any interval.
    const lanes = assignLanes(
      [slot('a', '13:00', '14:00'), slot('b', '14:00', '15:00')],
      minutes
    );
    expect(lanes.get('b')!.index).toBe(0);
  });

  it('is order-independent', () => {
    const items = [slot('a', '13:00', '14:30'), slot('b', '13:30', '15:00')];
    const forward = assignLanes(items, minutes);
    const reversed = assignLanes([...items].reverse(), minutes);
    expect(forward.get('a')).toEqual(reversed.get('a'));
    expect(forward.get('b')).toEqual(reversed.get('b'));
  });

  it('returns an empty map for no appointments', () => {
    expect(assignLanes([], minutes).size).toBe(0);
  });
});

describe('timezone helpers', () => {
  it('converts an instant to local minutes past midnight', () => {
    // 13:00 UTC is 09:00 EDT in September.
    expect(localMinutes('2026-09-01T13:00:00Z', TZ)).toBe(9 * 60);
    // 14:00 UTC is 09:00 EST in January.
    expect(localMinutes('2026-01-15T14:00:00Z', TZ)).toBe(9 * 60);
  });

  it('reports the local hour', () => {
    expect(localHour('2026-09-01T13:30:00Z', TZ)).toBe(9);
  });

  it('reports the local date, not the UTC one', () => {
    // 01:00 UTC on the 2nd is still the evening of the 1st in New York.
    expect(dateInZone('2026-09-02T01:00:00Z', TZ)).toBe('2026-09-01');
    expect(dateInZone('2026-09-02T13:00:00Z', TZ)).toBe('2026-09-02');
  });

  it('handles local midnight without wrapping to 1440', () => {
    // 04:00 UTC is midnight EDT.
    expect(localMinutes('2026-09-02T04:00:00Z', TZ)).toBe(0);
  });
});

describe('formatting', () => {
  it('parses HH:MM', () => {
    expect(hhmmToMinutes('09:30')).toBe(570);
    expect(hhmmToMinutes('00:00')).toBe(0);
    expect(hhmmToMinutes('23:59')).toBe(1439);
  });

  it('formats hours for the gutter', () => {
    expect(formatHour(0)).toBe('12am');
    expect(formatHour(9)).toBe('9am');
    expect(formatHour(12)).toBe('12pm');
    expect(formatHour(14)).toBe('2pm');
    expect(formatHour(23)).toBe('11pm');
  });
});

describe('visibleHourRange', () => {
  const hours = {
    '2026-09-01': { open: '09:00', close: '18:00', closed: false },
  };

  it('pads one hour either side of opening hours', () => {
    expect(visibleHourRange(hours, [], TZ)).toEqual({ startHour: 8, endHour: 19 });
  });

  it('stretches to include an appointment booked before opening', () => {
    // 11:00 UTC is 07:00 EDT — before the shop opens.
    const range = visibleHourRange(
      hours,
      [slot('a', '11:00', '12:00')],
      TZ
    );
    expect(range.startHour).toBe(6);
  });

  it('stretches to include an appointment running past closing', () => {
    // 23:00 UTC is 19:00 EDT, ending at 21:00 EDT.
    const range = visibleHourRange(
      hours,
      [{ id: 'a', startsAt: '2026-09-01T23:00:00Z', endsAt: '2026-09-02T01:00:00Z' }],
      TZ
    );
    expect(range.endHour).toBeGreaterThanOrEqual(21);
  });

  it('falls back when everything is closed and nothing is booked', () => {
    expect(
      visibleHourRange(
        { '2026-09-06': { open: '00:00', close: '00:00', closed: true } },
        [], TZ
      )
    ).toEqual({ startHour: 8, endHour: 20 });
  });

  it('never returns a range outside the day', () => {
    const range = visibleHourRange(
      { '2026-09-01': { open: '00:00', close: '23:00', closed: false } },
      [], TZ
    );
    expect(range.startHour).toBeGreaterThanOrEqual(0);
    expect(range.endHour).toBeLessThanOrEqual(24);
  });
});
