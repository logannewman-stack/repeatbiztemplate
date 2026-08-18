/**
 * ============================================================================
 * CALENDAR DATA
 * ============================================================================
 * Loads a date range's appointments plus everything needed to draw the grid
 * around them: who is working, when the shop is open, and what is blocked.
 * ============================================================================
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/demo';

export interface CalendarAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  gapStartsAt: string | null;
  gapEndsAt: string | null;
  status: string;
  staffId: string | null;
  staffName: string | null;
  staffColor: string | null;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  serviceName: string;
  durationMin: number;
  priceCents: number;
  addonsCents: number;
  depositCents: number;
  depositPaid: boolean;
  isNewClient: boolean;
  noShowRisk: number;
  notes: string | null;
  source: string;
}

export interface CalendarProvider {
  id: string;
  name: string;
  color: string;
  /** Shifts for each date in range: { '2026-09-01': [{start,end}] } */
  shiftsByDate: Record<string, Array<{ start: string; end: string }>>;
}

export interface CalendarData {
  appointments: CalendarAppointment[];
  providers: CalendarProvider[];
  timeOff: Array<{ staffId: string | null; from: string; to: string; reason: string | null }>;
  /** Opening hours per date, in local wall-clock time. */
  hoursByDate: Record<string, { open: string; close: string; closed: boolean }>;
  timezone: string;
  currency: string;
  demo: boolean;
}

const DAY_MS = 86_400_000;

export async function loadCalendar(
  businessId: string | null,
  fromDate: string,
  toDate: string,
  timezone: string,
  currency: string
): Promise<CalendarData> {
  const empty: CalendarData = {
    appointments: [], providers: [], timeOff: {} as never,
    hoursByDate: {}, timezone, currency, demo: true,
  };

  if (!isSupabaseConfigured() || !businessId) {
    return { ...empty, timeOff: [] };
  }

  const supabase = createAdminClient();

  // Pad the fetch by a day either side so an appointment straddling midnight
  // in the location's timezone still appears on the right column.
  const fetchFrom = new Date(`${fromDate}T00:00:00Z`);
  fetchFrom.setUTCDate(fetchFrom.getUTCDate() - 1);
  const fetchTo = new Date(`${toDate}T00:00:00Z`);
  fetchTo.setUTCDate(fetchTo.getUTCDate() + 2);

  const [
    { data: appointments },
    { data: staff },
    { data: schedules },
    { data: timeOff },
    { data: location },
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select(`
        id, starts_at, ends_at, gap_starts_at, gap_ends_at, status, staff_id,
        duration_min, price_cents, addons_cents, deposit_cents, deposit_paid_at,
        client_notes, source, client_id,
        clients(id, first_name, last_name, phone, client_metrics(completed_count, no_show_risk)),
        services(name),
        staff(display_name, color)
      `)
      .eq('business_id', businessId)
      .gte('starts_at', fetchFrom.toISOString())
      .lt('starts_at', fetchTo.toISOString())
      .order('starts_at'),
    supabase
      .from('staff')
      .select('id, display_name, color, sort_order')
      .eq('business_id', businessId)
      .eq('active', true)
      .eq('bookable', true)
      .order('sort_order'),
    supabase
      .from('staff_schedules')
      .select('staff_id, weekday, start_time, end_time, effective_from, effective_to'),
    supabase
      .from('staff_time_off')
      .select('staff_id, starts_at, ends_at, reason, recurrence')
      .lte('starts_at', fetchTo.toISOString())
      .gte('ends_at', fetchFrom.toISOString()),
    supabase
      .from('locations')
      .select('hours, hour_overrides, timezone')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('sort_order')
      .limit(1)
      .maybeSingle(),
  ]);

  const dates = eachDate(fromDate, toDate);

  // --- Providers with their shifts resolved per date ----------------------

  const providers: CalendarProvider[] = (staff ?? []).map((member, index) => {
    const shiftsByDate: Record<string, Array<{ start: string; end: string }>> = {};

    for (const date of dates) {
      const weekday = weekdayOf(date);
      shiftsByDate[date] = (schedules ?? [])
        .filter((row) => {
          if (row.staff_id !== member.id) return false;
          if (row.weekday !== weekday) return false;
          if (row.effective_from && date < row.effective_from) return false;
          if (row.effective_to && date > row.effective_to) return false;
          return true;
        })
        .map((row) => ({
          start: String(row.start_time).slice(0, 5),
          end: String(row.end_time).slice(0, 5),
        }))
        .sort((a, b) => a.start.localeCompare(b.start));
    }

    return {
      id: member.id,
      name: member.display_name,
      color: member.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      shiftsByDate,
    };
  });

  // --- Opening hours per date ---------------------------------------------

  const weeklyHours = Array.isArray(location?.hours)
    ? (location.hours as unknown as Array<{
        weekday: number; open?: string; close?: string; closed?: boolean;
      }>)
    : [];
  const overrides = Array.isArray(location?.hour_overrides)
    ? (location.hour_overrides as unknown as Array<{
        date: string; open?: string; close?: string; closed?: boolean;
      }>)
    : [];

  const hoursByDate: CalendarData['hoursByDate'] = {};
  for (const date of dates) {
    const override = overrides.find((o) => o.date === date);
    const weekly = weeklyHours.find((h) => h.weekday === weekdayOf(date));
    hoursByDate[date] = {
      open: override?.open ?? weekly?.open ?? '09:00',
      close: override?.close ?? weekly?.close ?? '18:00',
      closed: override?.closed ?? weekly?.closed ?? !weekly?.open,
    };
  }

  // --- Appointments --------------------------------------------------------

  const mapped: CalendarAppointment[] = (appointments ?? []).map((row) => {
    const client = row.clients as unknown as {
      id: string; first_name: string; last_name: string | null; phone: string | null;
      client_metrics: Array<{ completed_count: number; no_show_risk: number }>
        | { completed_count: number; no_show_risk: number } | null;
    } | null;

    const metricsRaw = client?.client_metrics;
    const metrics = Array.isArray(metricsRaw) ? metricsRaw[0] : metricsRaw;

    const service = row.services as unknown as { name: string } | null;
    const staffRow = row.staff as unknown as { display_name: string; color: string | null } | null;

    return {
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      gapStartsAt: row.gap_starts_at,
      gapEndsAt: row.gap_ends_at,
      status: row.status,
      staffId: row.staff_id,
      staffName: staffRow?.display_name ?? null,
      staffColor: staffRow?.color ?? null,
      clientId: row.client_id,
      clientName: [client?.first_name, client?.last_name].filter(Boolean).join(' ') || 'Guest',
      clientPhone: client?.phone ?? null,
      serviceName: service?.name ?? 'Service',
      durationMin: row.duration_min,
      priceCents: row.price_cents,
      addonsCents: row.addons_cents,
      depositCents: row.deposit_cents,
      depositPaid: Boolean(row.deposit_paid_at),
      isNewClient: (metrics?.completed_count ?? 0) === 0,
      noShowRisk: metrics?.no_show_risk ?? 0,
      notes: row.client_notes,
      source: row.source,
    };
  });

  // Recurring daily breaks are stored once; project them across the range so
  // the grid shades every day's lunch, not just the day it was created on.
  const projectedTimeOff: CalendarData['timeOff'] = [];
  for (const block of timeOff ?? []) {
    if (block.recurrence === 'daily') {
      const start = new Date(block.starts_at);
      const durationMs = new Date(block.ends_at).getTime() - start.getTime();
      for (const date of dates) {
        const projected = new Date(`${date}T00:00:00Z`);
        projected.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), 0, 0);
        projectedTimeOff.push({
          staffId: block.staff_id,
          from: projected.toISOString(),
          to: new Date(projected.getTime() + durationMs).toISOString(),
          reason: block.reason,
        });
      }
    } else {
      projectedTimeOff.push({
        staffId: block.staff_id,
        from: block.starts_at,
        to: block.ends_at,
        reason: block.reason,
      });
    }
  }

  return {
    appointments: mapped,
    providers,
    timeOff: projectedTimeOff,
    hoursByDate,
    timezone: location?.timezone || timezone,
    currency,
    demo: false,
  };
}

const DEFAULT_COLORS = ['#4F7CAC', '#7A9E7E', '#C08552', '#8E6C88', '#5B8266'];

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && out.length < 60) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Monday-start week containing `date`, as [from, to] YYYY-MM-DD. */
export function weekRange(date: string): [string, string] {
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = d.getUTCDay();
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const start = new Date(d.getTime() + offsetToMonday * DAY_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}
