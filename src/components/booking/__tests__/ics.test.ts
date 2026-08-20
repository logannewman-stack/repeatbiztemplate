/**
 * A malformed .ics does not error — it fails silently on iOS, and the client
 * simply never gets the reminder they thought they saved. So this file is
 * tested against the parts of RFC 5545 that actually bite.
 */

import { describe, it, expect } from 'vitest';
import { buildIcs } from '../BookingFlow';

const base = {
  startsAt: '2026-09-14T18:30:00.000Z',
  endsAt: '2026-09-14T19:30:00.000Z',
  serviceName: 'Balayage',
  staffName: 'Alex',
  businessName: '123 Example Studio',
  reference: 'AB12CD',
};

function lines(ics: string): string[] {
  return ics.split('\r\n');
}

describe('buildIcs', () => {
  it('uses CRLF line endings', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('\r\n');
    // Every line but the last, which has no terminator of its own.
    const raw = ics.split('\n');
    expect(raw.slice(0, -1).every((l) => l.endsWith('\r'))).toBe(true);
    expect(raw[raw.length - 1]).toBe('END:VCALENDAR');
  });

  it('opens and closes every block it opens', () => {
    const l = lines(buildIcs(base));
    expect(l[0]).toBe('BEGIN:VCALENDAR');
    expect(l[l.length - 1]).toBe('END:VCALENDAR');
    for (const block of ['VEVENT', 'VALARM']) {
      expect(l.filter((x) => x === `BEGIN:${block}`)).toHaveLength(1);
      expect(l.filter((x) => x === `END:${block}`)).toHaveLength(1);
      expect(l.indexOf(`BEGIN:${block}`)).toBeLessThan(l.indexOf(`END:${block}`));
    }
  });

  it('stamps times as UTC', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('DTSTART:20260914T183000Z');
    expect(ics).toContain('DTEND:20260914T193000Z');
  });

  it('normalises an offset timestamp rather than emitting it verbatim', () => {
    // Availability can hand back a local-offset ISO string. "20260914T113000-0700"
    // is not a legal RFC 5545 value and iOS drops the event without a word.
    const ics = buildIcs({ ...base, startsAt: '2026-09-14T11:30:00-07:00' });
    expect(ics).toContain('DTSTART:20260914T183000Z');
    expect(ics).not.toMatch(/DTSTART:[^\r]*[+-]\d{4}/);
  });

  it('escapes commas and semicolons in the service name', () => {
    const ics = buildIcs({ ...base, serviceName: 'Cut, Colour; Style' });
    expect(ics).toContain('SUMMARY:Cut\\, Colour\\; Style — 123 Example Studio');
  });

  it('escapes a backslash once, not twice', () => {
    const ics = buildIcs({ ...base, staffName: 'A\\B' });
    const line = lines(ics).find((l) => l.startsWith('DESCRIPTION:'))!;
    expect(line).toBe('DESCRIPTION:With A\\\\B. Confirmation AB12CD.');
  });

  it('folds a newline into the literal escape rather than breaking the line', () => {
    const ics = buildIcs({ ...base, businessName: 'Studio\nTwo' });
    // A raw newline here would end the property and corrupt everything after it.
    expect(lines(ics).filter((l) => l.startsWith('SUMMARY:'))).toHaveLength(1);
    expect(ics).toContain('\\nTwo');
  });

  it('carries a UID unique to the booking', () => {
    expect(buildIcs(base)).toContain('UID:AB12CD@booking');
  });
});

// --- Slot grouping ----------------------------------------------------------

import { groupByPartOfDay } from '../BookingFlow';

function slot(iso: string, staffId = 's1') {
  return {
    startsAt: iso, endsAt: iso, staffId, staffName: 'Alex',
    priceCents: 0, durationMin: 60,
  };
}

describe('groupByPartOfDay', () => {
  const NY = 'America/New_York';

  it('splits a day at noon and five', () => {
    const groups = groupByPartOfDay(
      [
        slot('2026-09-14T13:00:00Z'), // 09:00 NY
        slot('2026-09-14T18:00:00Z'), // 14:00 NY
        slot('2026-09-14T23:00:00Z'), // 19:00 NY
      ],
      NY
    );
    expect(groups.map((g) => g.label)).toEqual(['Morning', 'Afternoon', 'Evening']);
    expect(groups.every((g) => g.slots.length === 1)).toBe(true);
  });

  it('puts noon in the afternoon and five in the evening', () => {
    const groups = groupByPartOfDay(
      [slot('2026-09-14T16:00:00Z'), slot('2026-09-14T21:00:00Z')], // 12:00, 17:00 NY
      NY
    );
    expect(groups.map((g) => g.label)).toEqual(['Afternoon', 'Evening']);
  });

  it('drops empty parts of the day rather than showing them', () => {
    const groups = groupByPartOfDay([slot('2026-09-14T18:00:00Z')], NY);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Afternoon');
  });

  it('buckets by the business timezone, not the browser', () => {
    // 23:00 UTC is 19:00 the same day in New York and 08:00 the next in Tokyo.
    const ny = groupByPartOfDay([slot('2026-09-14T23:00:00Z')], NY);
    const tokyo = groupByPartOfDay([slot('2026-09-14T23:00:00Z')], 'Asia/Tokyo');
    expect(ny[0].label).toBe('Evening');
    expect(tokyo[0].label).toBe('Morning');
  });

  it('keeps midnight in the evening bucket rather than dropping it', () => {
    const groups = groupByPartOfDay([slot('2026-09-15T04:00:00Z')], NY); // 00:00 NY
    expect(groups).toHaveLength(1);
    expect(groups[0].slots).toHaveLength(1);
  });

  it('preserves order inside a group', () => {
    const groups = groupByPartOfDay(
      [slot('2026-09-14T14:00:00Z'), slot('2026-09-14T15:00:00Z')],
      NY
    );
    expect(groups[0].slots.map((s) => s.startsAt)).toEqual([
      '2026-09-14T14:00:00Z', '2026-09-14T15:00:00Z',
    ]);
  });
});

// --- Service menu grouping --------------------------------------------------

import { groupByCategory } from '../BookingFlow';
import type { DemoService } from '@/lib/demo';

function svc(name: string, category: string): DemoService {
  return {
    id: name, name, slug: name, description: '', category,
    duration_min: 60, processing_time_min: 0, finish_time_min: 0,
    price_cents: 1000, member_price_cents: null, rebook_interval_days: 30,
    deposit_mode: 'none', deposit_percent: 0, deposit_flat_cents: 0,
    taxable: true, addons: [],
  } as unknown as DemoService;
}

describe('groupByCategory', () => {
  it('returns one unnamed group when nothing is categorised', () => {
    const groups = groupByCategory([svc('A', ''), svc('B', '')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('');
    expect(groups[0].services).toHaveLength(2);
  });

  it('keeps the order the business set', () => {
    const groups = groupByCategory([
      svc('A', 'Color'), svc('B', 'Hair'), svc('C', 'Color'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Color', 'Hair']);
    expect(groups[0].services.map((s) => s.name)).toEqual(['A', 'C']);
  });

  it('collects uncategorised services at the end rather than dropping them', () => {
    const groups = groupByCategory([svc('A', ''), svc('B', 'Hair'), svc('C', '')]);
    expect(groups.map((g) => g.label)).toEqual(['Hair', 'More']);
    expect(groups[1].services.map((s) => s.name)).toEqual(['A', 'C']);
    // Nothing is lost between input and output.
    expect(groups.flatMap((g) => g.services)).toHaveLength(3);
  });

  it('never loses a service', () => {
    const input = [svc('A', 'X'), svc('B', 'Y'), svc('C', 'X'), svc('D', '')];
    const out = groupByCategory(input).flatMap((g) => g.services);
    expect(new Set(out.map((s) => s.name))).toEqual(new Set(['A', 'B', 'C', 'D']));
  });
});

// --- Loyalty tiers ----------------------------------------------------------

import { tierFor } from '@/components/app/LoyaltyCard';

const TIERS = [
  { name: 'Member', minAnnualSpendCents: 0, perks: ['Earn points'] },
  { name: 'Silver', minAnnualSpendCents: 50000, perks: ['Early access'] },
  { name: 'Gold', minAnnualSpendCents: 120000, perks: ['Priority booking'] },
  { name: 'Platinum', minAnnualSpendCents: 250000, perks: ['Waived deposits'] },
];

describe('tierFor', () => {
  it('puts a new client on the bottom tier with the next one ahead', () => {
    const s = tierFor(0, TIERS)!;
    expect(s.current.name).toBe('Member');
    expect(s.next!.name).toBe('Silver');
  });

  it('promotes exactly at the threshold, not a cent after', () => {
    expect(tierFor(49999, TIERS)!.current.name).toBe('Member');
    expect(tierFor(50000, TIERS)!.current.name).toBe('Silver');
  });

  it('has no next tier at the top', () => {
    const s = tierFor(300000, TIERS)!;
    expect(s.current.name).toBe('Platinum');
    expect(s.next).toBeNull();
  });

  it('does not trust the order the tiers were written in', () => {
    const shuffled = [TIERS[2], TIERS[0], TIERS[3], TIERS[1]];
    const s = tierFor(60000, shuffled)!;
    expect(s.current.name).toBe('Silver');
    expect(s.next!.name).toBe('Gold');
  });

  it('returns null rather than throwing when loyalty is switched off', () => {
    expect(tierFor(50000, [])).toBeNull();
  });

  it('handles a single-tier programme', () => {
    const s = tierFor(10, [TIERS[0]])!;
    expect(s.current.name).toBe('Member');
    expect(s.next).toBeNull();
  });
});
