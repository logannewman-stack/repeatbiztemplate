import { describe, it, expect } from 'vitest';
import { isQuietHour, localHour, QUIET_HOURS, WEEKLY_PROMOTIONAL_CAP } from '@/lib/messaging/budget';

/**
 * The quiet-hours window wraps midnight (21:00 → 08:00), which is the case a
 * naive `hour >= start && hour < end` comparison gets silently wrong — it
 * would be false for every hour of the day.
 */
describe('isQuietHour', () => {
  const at = (iso: string) => new Date(iso);

  it('is quiet late at night', () => {
    // 22:00 in New York.
    expect(isQuietHour('America/New_York', at('2026-03-10T02:00:00Z'))).toBe(true);
  });

  it('is quiet in the small hours', () => {
    // 03:00 in New York.
    expect(isQuietHour('America/New_York', at('2026-03-10T07:00:00Z'))).toBe(true);
  });

  it('is not quiet mid-morning', () => {
    // 10:00 in New York.
    expect(isQuietHour('America/New_York', at('2026-03-10T14:00:00Z'))).toBe(false);
  });

  it('is not quiet mid-afternoon', () => {
    // 15:00 in New York.
    expect(isQuietHour('America/New_York', at('2026-03-10T19:00:00Z'))).toBe(false);
  });

  it('opens exactly at the end hour', () => {
    // 08:00 in New York — the first sendable hour.
    expect(isQuietHour('America/New_York', at('2026-03-10T12:00:00Z'))).toBe(false);
  });

  it('closes exactly at the start hour', () => {
    // 21:00 in New York — the first quiet hour.
    expect(isQuietHour('America/New_York', at('2026-03-11T01:00:00Z'))).toBe(true);
  });

  it('follows the business timezone, not the server', () => {
    const instant = at('2026-03-10T02:00:00Z');
    // The same moment is 22:00 in New York and 10:00 in Tokyo.
    expect(isQuietHour('America/New_York', instant)).toBe(true);
    expect(isQuietHour('Asia/Tokyo', instant)).toBe(false);
  });

  it('does not throw on an invalid timezone', () => {
    expect(() => isQuietHour('Not/AZone', at('2026-03-10T14:00:00Z'))).not.toThrow();
  });
});

describe('localHour', () => {
  it('reads midnight as 0 rather than 24', () => {
    // Intl formats midnight as "24" with hour12:false, which would break every
    // comparison against the wrapping window.
    expect(localHour('UTC', new Date('2026-03-10T00:30:00Z'))).toBe(0);
  });

  it('converts across timezones', () => {
    const instant = new Date('2026-03-10T18:00:00Z');
    expect(localHour('UTC', instant)).toBe(18);
    expect(localHour('America/New_York', instant)).toBe(14);
  });

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    expect(localHour('Not/AZone', new Date('2026-03-10T18:00:00Z'))).toBe(18);
  });
});

describe('budget constants', () => {
  it('caps promotional sends below the churn threshold', () => {
    // More than six notifications a week from one sender measurably raises
    // uninstall rate; the cap has to sit under that, not at it.
    expect(WEEKLY_PROMOTIONAL_CAP).toBeLessThan(6);
  });

  it('has a quiet window that wraps midnight', () => {
    expect(QUIET_HOURS.startHour).toBeGreaterThan(QUIET_HOURS.endHour);
  });
});
