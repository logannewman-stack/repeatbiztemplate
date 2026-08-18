/**
 * ============================================================================
 * CALENDAR LAYOUT
 * ============================================================================
 * The pure geometry behind the calendar grid, kept out of the component so it
 * can be tested directly. Overlap handling in particular is easy to get subtly
 * wrong in ways that only show up on a busy Saturday.
 * ============================================================================
 */

export interface Positioned {
  id: string;
  startsAt: string;
  endsAt: string;
}

export interface Lane {
  index: number;
  total: number;
}

/**
 * Split overlapping appointments across the width of a column.
 *
 * Greedy interval colouring: walk in start order and put each appointment in
 * the first lane whose previous occupant has already ended.
 *
 * Appointments are grouped into clusters separated by genuine gaps, and lane
 * counts are computed per cluster. Without that, one busy morning would
 * squeeze an isolated afternoon booking into a narrow sliver for no reason.
 */
export function assignLanes(
  items: Positioned[],
  toMinutes: (iso: string) => number
): Map<string, Lane> {
  const sorted = [...items].sort(
    (a, b) => toMinutes(a.startsAt) - toMinutes(b.startsAt)
  );

  const result = new Map<string, Lane>();
  const clusters: string[][] = [];

  let laneEnds: number[] = [];
  let cluster: string[] = [];
  let clusterEnd = -Infinity;

  for (const item of sorted) {
    const from = toMinutes(item.startsAt);
    const to = toMinutes(item.endsAt);

    // Nothing is still running: close the cluster and start fresh.
    if (from >= clusterEnd && cluster.length > 0) {
      clusters.push(cluster);
      cluster = [];
      laneEnds = [];
      clusterEnd = -Infinity;
    }

    let lane = laneEnds.findIndex((end) => end <= from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(to);
    } else {
      laneEnds[lane] = to;
    }

    result.set(item.id, { index: lane, total: 1 });
    cluster.push(item.id);
    clusterEnd = Math.max(clusterEnd, to);
  }
  if (cluster.length > 0) clusters.push(cluster);

  // Everything in a cluster shares its lane count so the widths line up.
  for (const ids of clusters) {
    const total = Math.max(...ids.map((id) => (result.get(id)?.index ?? 0) + 1));
    for (const id of ids) {
      const entry = result.get(id)!;
      result.set(id, { index: entry.index, total });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------
// The grid is drawn in the location's wall-clock time, but every stored
// instant is UTC. These convert without pulling in a timezone library, using
// Intl to read the zone's offset at the given instant — which keeps DST
// transitions correct.

function zonedParts(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
}

/** Minutes past local midnight for an instant, in the given zone. */
export function localMinutes(iso: string, timeZone: string): number {
  const parts = zonedParts(iso, timeZone);
  // Intl renders midnight as "24" in some environments.
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function localHour(iso: string, timeZone: string): number {
  return Math.floor(localMinutes(iso, timeZone) / 60);
}

/** YYYY-MM-DD for an instant, as seen in the given zone. */
export function dateInZone(iso: string, timeZone: string): string {
  const parts = zonedParts(iso, timeZone);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function todayInZone(timeZone: string): string {
  return dateInZone(new Date().toISOString(), timeZone);
}

/** "09:30" → 570 */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 14 → "2pm" */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
}

/**
 * The vertical window the grid should cover: wide enough for the opening
 * hours and for any appointment booked outside them, so nothing is clipped
 * off the top or bottom where a user would never find it.
 */
export function visibleHourRange(
  hoursByDate: Record<string, { open: string; close: string; closed: boolean }>,
  appointments: Positioned[],
  timeZone: string,
  fallback: { start: number; end: number } = { start: 8, end: 20 }
): { startHour: number; endHour: number } {
  let earliest = 23;
  let latest = 1;
  let sawAnything = false;

  for (const hours of Object.values(hoursByDate)) {
    if (hours.closed) continue;
    sawAnything = true;
    earliest = Math.min(earliest, Number(hours.open.slice(0, 2)));
    latest = Math.max(latest, Number(hours.close.slice(0, 2)) + 1);
  }

  for (const appointment of appointments) {
    sawAnything = true;
    earliest = Math.min(earliest, localHour(appointment.startsAt, timeZone));
    latest = Math.max(latest, localHour(appointment.endsAt, timeZone) + 1);
  }

  if (!sawAnything || earliest > latest) {
    return { startHour: fallback.start, endHour: fallback.end };
  }

  return {
    startHour: Math.max(earliest - 1, 0),
    endHour: Math.min(latest, 24),
  };
}
