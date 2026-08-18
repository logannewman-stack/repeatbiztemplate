/**
 * ============================================================================
 * AVAILABILITY ENGINE
 * ============================================================================
 * Given a service, a set of providers, their schedules, and everything already
 * on the calendar, produce the list of bookable slots.
 *
 * The engine is a pure function. It performs no I/O, so it can be unit-tested
 * exhaustively and reused unchanged on the server, in a cron job, or inside
 * the waitlist matcher. `loadAvailability` in `queries.ts` does the fetching.
 *
 * What it accounts for:
 *   - recurring weekly shifts, with effective-from/to windows
 *   - time off, recurring breaks, business-wide closures
 *   - location opening hours and per-date overrides
 *   - existing bookings, via provider- and room-level busy blocks
 *   - buffers before and after, resolved service → provider → business default
 *   - processing gaps, so a short service can be booked inside a long one
 *   - lead time, booking horizon, and member priority access
 *   - per-day capacity caps on a service
 * ============================================================================
 */

import type { AvailabilityInput, BusyBlock, DaySlots, Slot } from './types';

const MINUTE = 60_000;

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------
// Business hours are wall-clock ("we open at 9"), but everything stored is an
// absolute instant. These convert between the two without pulling in a
// timezone library, using Intl to read the zone's offset at a given instant —
// which means DST transitions are handled correctly.

function zonedPartsAt(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some environments.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedPartsAt(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convert a wall-clock time in `timeZone` to an absolute instant.
 * Resolved iteratively so it stays correct across DST boundaries, where the
 * offset depends on the very instant being computed.
 */
export function zonedTimeToUtc(
  dateStr: string,      // YYYY-MM-DD
  timeStr: string,      // HH:MM or HH:MM:SS
  timeZone: string
): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss = 0] = timeStr.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, ss);

  let guess = new Date(naive);
  for (let i = 0; i < 3; i++) {
    const offset = zoneOffsetMs(guess, timeZone);
    const next = new Date(naive - offset);
    if (next.getTime() === guess.getTime()) break;
    guess = next;
  }
  return guess;
}

/** YYYY-MM-DD for an instant, as seen in `timeZone`. */
export function utcToZonedDateString(date: Date, timeZone: string): string {
  const p = zonedPartsAt(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** 0 = Sunday. Weekday of an instant as seen in `timeZone`. */
export function zonedWeekday(dateStr: string, timeZone: string): number {
  // Noon avoids any DST edge landing the date on the neighbouring day.
  const noon = zonedTimeToUtc(dateStr, '12:00', timeZone);
  const p = zonedPartsAt(noon, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

function eachDate(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (out.length > 400) break; // hard stop against a bad range
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a Postgres timestamptz into epoch ms.
 *
 * Postgres renders the zone offset with as few digits as it can — "+00",
 * "-04", "+05:30" — and only the last of those is valid ISO-8601 as far as
 * `new Date()` is concerned. Feeding it the raw value yields Invalid Date,
 * which would silently make every existing booking invisible to the
 * availability engine. Normalize the offset before parsing.
 */
export function parseTimestamp(raw: string): number {
  let s = raw.trim().replace(' ', 'T');

  const zone = s.match(/([+-])(\d{2})(?::?(\d{2}))?$/);
  if (zone) {
    s = s.slice(0, zone.index) + `${zone[1]}${zone[2]}:${zone[3] ?? '00'}`;
  } else if (!s.endsWith('Z')) {
    // No offset at all — Postgres was configured for UTC output.
    s += 'Z';
  }

  return new Date(s).getTime();
}

/** Parse a Postgres tstzrange as returned by PostgREST. */
export function parseRange(range: string): { from: number; to: number } | null {
  const m = range.match(/^[[(]"?([^",]*)"?,"?([^",)\]]*)"?[)\]]$/);
  if (!m) return null;

  // An empty bound means unbounded in that direction.
  const from = m[1] ? parseTimestamp(m[1]) : Number.MIN_SAFE_INTEGER;
  const to = m[2] ? parseTimestamp(m[2]) : Number.MAX_SAFE_INTEGER;
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return { from, to };
}

interface LocationHour {
  weekday: number;
  open?: string;
  close?: string;
  closed?: boolean;
}

interface HourOverride {
  date: string;
  closed?: boolean;
  open?: string;
  close?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Service timeline
// ---------------------------------------------------------------------------

export interface ServiceTimeline {
  /** Total wall-clock length the client is present for. */
  totalMin: number;
  /** Provider-attended work before the processing gap. */
  initialMin: number;
  processingMin: number;
  /** Provider-attended work after the gap. */
  finishMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  hasGap: boolean;
}

export function buildTimeline(
  service: AvailabilityInput['service'],
  staffBufferAfter: number | null | undefined,
  rules: AvailabilityInput['rules'],
  durationOverrideMin?: number | null
): ServiceTimeline {
  const totalMin = durationOverrideMin ?? service.duration_min;
  const processingMin = service.processing_time_min ?? 0;
  const finishMin = service.finish_time_min ?? 0;
  // Guard against a misconfigured service whose gap exceeds its duration.
  const initialMin = Math.max(totalMin - processingMin - finishMin, 0);
  const hasGap = processingMin > 0 && initialMin > 0 && finishMin > 0;

  return {
    totalMin,
    initialMin: hasGap ? initialMin : totalMin,
    processingMin: hasGap ? processingMin : 0,
    finishMin: hasGap ? finishMin : 0,
    hasGap,
    bufferBeforeMin: service.buffer_before_min ?? rules.defaultBufferBeforeMinutes,
    bufferAfterMin:
      service.buffer_after_min ?? staffBufferAfter ?? rules.defaultBufferAfterMinutes,
  };
}

/** The windows a provider is actually occupied for a slot starting at `startMs`. */
export function busyWindowsFor(startMs: number, t: ServiceTimeline): Array<{ from: number; to: number }> {
  const blockFrom = startMs - t.bufferBeforeMin * MINUTE;
  const endMs = startMs + t.totalMin * MINUTE;
  const blockTo = endMs + t.bufferAfterMin * MINUTE;

  if (!t.hasGap) return [{ from: blockFrom, to: blockTo }];

  const gapFrom = startMs + t.initialMin * MINUTE;
  const gapTo = gapFrom + t.processingMin * MINUTE;
  return [
    { from: blockFrom, to: gapFrom },
    { from: gapTo, to: blockTo },
  ];
}

function overlaps(a: { from: number; to: number }, b: { from: number; to: number }) {
  return a.from < b.to && b.from < a.to;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export function computeAvailability(input: AvailabilityInput): DaySlots[] {
  const {
    service, staff, schedules, unavailable, busy, location,
    rooms, fromDate, toDate, rules,
  } = input;

  const now = input.now ?? new Date();
  const tz = location.timezone || input.businessTimezone || 'UTC';

  const earliestMs = now.getTime() + rules.minLeadTimeMinutes * MINUTE;
  const horizonDays = rules.maxAdvanceBookingDays + (input.priorityBookingDays ?? 0);
  const latestMs = now.getTime() + horizonDays * 24 * 60 * MINUTE;

  // --- Index everything once -----------------------------------------------

  const busyByStaff = new Map<string, BusyBlock[]>();
  const busyByRoom = new Map<string, BusyBlock[]>();
  for (const row of busy) {
    const parsed = parseRange(row.block);
    if (!parsed) continue;
    const block: BusyBlock = {
      staffId: row.staff_id, roomId: row.room_id, from: parsed.from, to: parsed.to,
    };
    if (row.staff_id) {
      const list = busyByStaff.get(row.staff_id) ?? [];
      list.push(block);
      busyByStaff.set(row.staff_id, list);
    }
    if (row.room_id) {
      const list = busyByRoom.get(row.room_id) ?? [];
      list.push(block);
      busyByRoom.set(row.room_id, list);
    }
  }

  // Time off and closures. A null staffId closes the whole business.
  const blockedAll: Array<{ from: number; to: number }> = [];
  const blockedByStaff = new Map<string, Array<{ from: number; to: number }>>();
  for (const u of unavailable) {
    const window = { from: parseTimestamp(u.from), to: parseTimestamp(u.to) };
    if (Number.isNaN(window.from) || Number.isNaN(window.to)) continue;
    if (u.staffId) {
      const list = blockedByStaff.get(u.staffId) ?? [];
      list.push(window);
      blockedByStaff.set(u.staffId, list);
    } else {
      blockedAll.push(window);
    }
  }

  const schedulesByStaff = new Map<string, AvailabilityInput['schedules']>();
  for (const s of schedules) {
    const list = schedulesByStaff.get(s.staff_id) ?? [];
    list.push(s);
    schedulesByStaff.set(s.staff_id, list);
  }

  const hours = (location.hours ?? []) as unknown as LocationHour[];
  const overrides = (location.hour_overrides ?? []) as unknown as HourOverride[];
  const overrideByDate = new Map(overrides.map((o) => [o.date, o]));

  const eligibleRooms = service.required_room_kind
    ? rooms.filter((r) => r.kind === service.required_room_kind)
    : [];

  // --- Walk the requested dates -------------------------------------------

  const results: DaySlots[] = [];

  for (const date of eachDate(fromDate, toDate)) {
    const weekday = zonedWeekday(date, tz);
    const override = overrideByDate.get(date);
    const dayHours = hours.find((h) => h.weekday === weekday);

    if (override?.closed || (!override && (dayHours?.closed || !dayHours?.open))) {
      results.push({ date, slots: [], closedReason: 'closed' });
      continue;
    }

    const openTime = override?.open ?? dayHours?.open ?? '00:00';
    const closeTime = override?.close ?? dayHours?.close ?? '23:59';
    const openMs = zonedTimeToUtc(date, openTime, tz).getTime();
    const closeMs = zonedTimeToUtc(date, closeTime, tz).getTime();

    if (closeMs <= earliestMs || openMs > latestMs) {
      results.push({ date, slots: [], closedReason: 'outside_window' });
      continue;
    }

    const daySlots: Slot[] = [];
    let anyStaffWorking = false;

    for (const provider of staff) {
      const timeline = buildTimeline(
        service, provider.buffer_after_min, rules, provider.durationOverrideMin
      );

      // Shifts covering this weekday, still in their effective window.
      const shifts = (schedulesByStaff.get(provider.id) ?? []).filter((s) => {
        if (s.weekday !== weekday) return false;
        if (s.effective_from && date < s.effective_from) return false;
        if (s.effective_to && date > s.effective_to) return false;
        return true;
      });
      if (shifts.length === 0) continue;
      anyStaffWorking = true;

      const providerBusy = busyByStaff.get(provider.id) ?? [];
      const providerBlocked = blockedByStaff.get(provider.id) ?? [];

      const priceCents =
        provider.priceOverrideCents ??
        Math.round(service.price_cents * Number(provider.price_multiplier ?? 1));

      for (const shift of shifts) {
        const shiftStart = Math.max(
          zonedTimeToUtc(date, shift.start_time, tz).getTime(),
          openMs
        );
        const shiftEnd = Math.min(
          zonedTimeToUtc(date, shift.end_time, tz).getTime(),
          closeMs
        );
        if (shiftEnd <= shiftStart) continue;

        // Align the grid to the shift start so slots read cleanly.
        const step = rules.slotIntervalMinutes * MINUTE;

        for (let startMs = shiftStart; startMs < shiftEnd; startMs += step) {
          const endMs = startMs + timeline.totalMin * MINUTE;

          // Must finish inside the shift and before close.
          if (endMs > shiftEnd) break;
          if (startMs < earliestMs || startMs > latestMs) continue;

          const windows = busyWindowsFor(startMs, timeline);

          // Provider conflicts. When processing-gap overlap is switched off,
          // treat the service as one solid block instead of two.
          const effectiveWindows = rules.allowProcessingTimeOverlap
            ? windows
            : [{ from: windows[0].from, to: windows[windows.length - 1].to }];

          const providerConflict = effectiveWindows.some((w) =>
            providerBusy.some((b) => overlaps(w, b)) ||
            providerBlocked.some((b) => overlaps(w, b)) ||
            blockedAll.some((b) => overlaps(w, b))
          );
          if (providerConflict) continue;

          // Room, when the service needs one.
          let roomId: string | null = null;
          if (service.required_room_kind) {
            const wholeWindow = {
              from: windows[0].from,
              to: windows[windows.length - 1].to,
            };
            const freeRoom = eligibleRooms.find((room) => {
              const roomBusy = busyByRoom.get(room.id) ?? [];
              const concurrent = roomBusy.filter((b) => overlaps(wholeWindow, b)).length;
              return concurrent < (room.capacity ?? 1);
            });
            if (!freeRoom) continue;
            roomId = freeRoom.id;
          }

          // Does this slot only exist because it sits inside someone else's
          // processing gap? Worth surfacing, and worth measuring.
          const fillsProcessingGap =
            rules.allowProcessingTimeOverlap &&
            providerBusy.some((b) => b.to <= startMs) &&
            providerBusy.some((b) => b.from >= endMs) &&
            providerBusy.some((b) => b.to > startMs - 4 * 60 * MINUTE && b.to <= startMs);

          daySlots.push({
            startsAt: new Date(startMs).toISOString(),
            endsAt: new Date(endMs).toISOString(),
            staffId: provider.id,
            staffName: provider.display_name,
            roomId,
            busyBlocks: windows.map((w) => ({
              from: new Date(w.from).toISOString(),
              to: new Date(w.to).toISOString(),
            })),
            gapStartsAt: timeline.hasGap
              ? new Date(startMs + timeline.initialMin * MINUTE).toISOString()
              : null,
            gapEndsAt: timeline.hasGap
              ? new Date(startMs + (timeline.initialMin + timeline.processingMin) * MINUTE).toISOString()
              : null,
            priceCents,
            durationMin: timeline.totalMin,
            fillsProcessingGap,
          });
        }
      }
    }

    // Per-day capacity cap across all providers.
    let capped = daySlots;
    if (service.max_per_day) {
      const bookedToday = busy.filter((b) => {
        const p = parseRange(b.block);
        return p && utcToZonedDateString(new Date(p.from), tz) === date;
      }).length;
      if (bookedToday >= service.max_per_day) capped = [];
    }

    capped.sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) || a.staffName.localeCompare(b.staffName)
    );

    results.push({
      date,
      slots: capped,
      closedReason: capped.length
        ? undefined
        : anyStaffWorking
          ? 'fully_booked'
          : 'no_staff',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Convenience selectors used by the booking UI and the retention engine
// ---------------------------------------------------------------------------

/** One slot per start time, preferring a given provider. Keeps the grid tidy. */
export function dedupeByTime(slots: Slot[], preferStaffId?: string | null): Slot[] {
  const byTime = new Map<string, Slot>();
  for (const slot of slots) {
    const existing = byTime.get(slot.startsAt);
    if (!existing) {
      byTime.set(slot.startsAt, slot);
      continue;
    }
    if (preferStaffId && slot.staffId === preferStaffId && existing.staffId !== preferStaffId) {
      byTime.set(slot.startsAt, slot);
    }
  }
  return [...byTime.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * The single slot to lead with in a rebooking prompt or nudge: closest to the
 * client's ideal return date, with their usual provider, at their usual
 * time of day. One good suggestion converts far better than a wall of times.
 */
export function pickSuggestedSlot(
  days: DaySlots[],
  opts: {
    idealDate: Date;
    preferStaffId?: string | null;
    /** Local hour the client usually books, 0-23. */
    preferHour?: number | null;
    timezone: string;
  }
): Slot | null {
  const all = days.flatMap((d) => d.slots);
  if (all.length === 0) return null;

  const idealMs = opts.idealDate.getTime();

  const scored = all.map((slot) => {
    const startMs = new Date(slot.startsAt).getTime();
    // Days away from the ideal return date, weighted most heavily.
    let score = Math.abs(startMs - idealMs) / (24 * 60 * MINUTE);
    // Their usual provider is worth about three days of date drift.
    if (opts.preferStaffId && slot.staffId !== opts.preferStaffId) score += 3;
    // Their usual time of day is worth about one.
    if (opts.preferHour != null) {
      const parts = zonedPartsAt(new Date(startMs), opts.timezone);
      score += Math.min(Math.abs(parts.hour - opts.preferHour), 6) * 0.25;
    }
    return { slot, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0].slot;
}

/** Count of open slots per day — powers the scarcity badge. */
export function slotCountsByDate(days: DaySlots[]): Record<string, number> {
  return Object.fromEntries(
    days.map((d) => [d.date, dedupeByTime(d.slots).length])
  );
}
