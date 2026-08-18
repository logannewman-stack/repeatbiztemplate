'use client';

/**
 * ============================================================================
 * CALENDAR
 * ============================================================================
 * Day view puts providers in columns, which is how a front desk actually
 * thinks: "who is free at 2?" Week view puts days in columns for planning.
 *
 * Appointments are absolutely positioned against a minute grid rather than
 * laid out in a table, because overlapping bookings — a client sitting in a
 * processing gap while the provider starts someone else — cannot be expressed
 * in table rows without lying about the schedule.
 * ============================================================================
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Badge, Card, Alert, Avatar, EmptyState } from '@/components/ui';
import { Modal, useToast } from '@/components/ui/client';
import { cn, formatMoney, formatDuration, formatPhone } from '@/lib/utils';
import type { CalendarAppointment, CalendarProvider } from '@/lib/admin/calendar';
import {
  assignLanes, localMinutes, dateInZone, todayInZone,
  hhmmToMinutes, formatHour, visibleHourRange,
} from '@/lib/admin/calendar-layout';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PIXELS_PER_MINUTE = 1.5;

export type CalendarView = 'day' | 'week';

export function Calendar({
  view, date, appointments, providers, timeOff, hoursByDate, timezone, currency,
  visitNoun, demo,
}: {
  view: CalendarView;
  /** YYYY-MM-DD anchor date. */
  date: string;
  appointments: CalendarAppointment[];
  providers: CalendarProvider[];
  timeOff: Array<{ staffId: string | null; from: string; to: string; reason: string | null }>;
  hoursByDate: Record<string, { open: string; close: string; closed: boolean }>;
  timezone: string;
  currency: string;
  visitNoun: string;
  demo?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<CalendarAppointment | null>(null);

  const dates = React.useMemo(
    () => Object.keys(hoursByDate).sort(),
    [hoursByDate]
  );

  // The visible window is the union of opening hours across the range, padded
  // so an appointment booked slightly outside hours is still visible rather
  // than clipped off the top of the grid.
  const { startHour, endHour } = React.useMemo(
    () => visibleHourRange(hoursByDate, appointments, timezone),
    [hoursByDate, appointments, timezone]
  );

  const totalMinutes = (endHour - startHour) * 60;
  const gridHeight = totalMinutes * PIXELS_PER_MINUTE;

  return (
    <div className="space-y-4">
      {demo && (
        <Alert tone="warning" title="Demo mode">
          The calendar reads live bookings only. Connect Supabase to see the real
          schedule — see <code>SETUP.md</code>.
        </Alert>
      )}

      {providers.length === 0 ? (
        <EmptyState
          title="No bookable providers"
          description="Add someone in Team and give them a weekly schedule before the calendar has anything to draw."
          action={<Button onClick={() => router.push('/admin/staff')}>Go to Team</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="scroll-x">
            <div
              className="grid min-w-max"
              style={{
                gridTemplateColumns:
                  `4rem repeat(${view === 'day' ? providers.length : dates.length}, minmax(11rem, 1fr))`,
              }}
            >
              {/* Header row */}
              <div className="sticky left-0 z-20 border-b border-r border-[var(--color-border)] bg-[var(--color-surface)]" />

              {view === 'day'
                ? providers.map((provider) => (
                    <div
                      key={provider.id}
                      className="flex items-center gap-2 border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5"
                    >
                      <Avatar name={provider.name} color={provider.color} size="xs" />
                      <span className="truncate text-sm font-medium">{provider.name}</span>
                    </div>
                  ))
                : dates.map((day) => {
                    const isToday = day === todayInZone(timezone);
                    const count = appointments.filter(
                      (a) => dateInZone(a.startsAt, timezone) === day
                    ).length;
                    return (
                      <div
                        key={day}
                        className={cn(
                          'border-b border-r border-[var(--color-border)] px-3 py-2.5',
                          isToday ? 'bg-[var(--color-brand-soft)]' : 'bg-[var(--color-surface)]'
                        )}
                      >
                        <p
                          className={cn(
                            'text-sm font-medium',
                            isToday && 'text-[var(--color-brand)]'
                          )}
                        >
                          {DAY_NAMES[new Date(`${day}T12:00:00Z`).getUTCDay()]}{' '}
                          {Number(day.slice(8, 10))}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {count} {count === 1 ? visitNoun : `${visitNoun}s`}
                        </p>
                      </div>
                    );
                  })}

              {/* Time gutter */}
              <div
                className="sticky left-0 z-10 border-r border-[var(--color-border)] bg-[var(--color-surface)]"
                style={{ height: gridHeight }}
              >
                {Array.from({ length: endHour - startHour }, (_, i) => (
                  <div
                    key={i}
                    className="relative border-b border-[var(--color-border)]"
                    style={{ height: 60 * PIXELS_PER_MINUTE }}
                  >
                    <span className="absolute -top-2 right-2 text-xs tabular-nums text-[var(--color-muted)]">
                      {formatHour(startHour + i)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Columns */}
              {view === 'day'
                ? providers.map((provider) => (
                    <Column
                      key={provider.id}
                      height={gridHeight}
                      startHour={startHour}
                      endHour={endHour}
                      shifts={provider.shiftsByDate[date] ?? []}
                      hours={hoursByDate[date]}
                      appointments={appointments.filter(
                        (a) =>
                          a.staffId === provider.id &&
                          dateInZone(a.startsAt, timezone) === date
                      )}
                      timeOff={timeOff.filter(
                        (t) =>
                          (t.staffId === provider.id || t.staffId === null) &&
                          dateInZone(t.from, timezone) === date
                      )}
                      timezone={timezone}
                      color={provider.color}
                      onSelect={setSelected}
                      showToday={date === todayInZone(timezone)}
                    />
                  ))
                : dates.map((day) => (
                    <Column
                      key={day}
                      height={gridHeight}
                      startHour={startHour}
                      endHour={endHour}
                      shifts={providers.flatMap((p) => p.shiftsByDate[day] ?? [])}
                      hours={hoursByDate[day]}
                      appointments={appointments.filter(
                        (a) => dateInZone(a.startsAt, timezone) === day
                      )}
                      timeOff={timeOff.filter(
                        (t) => dateInZone(t.from, timezone) === day
                      )}
                      timezone={timezone}
                      onSelect={setSelected}
                      showToday={day === todayInZone(timezone)}
                      colorByStaff
                    />
                  ))}
            </div>
          </div>
        </Card>
      )}

      <Legend />

      {selected && (
        <AppointmentDetail
          appointment={selected}
          currency={currency}
          timezone={timezone}
          visitNoun={visitNoun}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Column({
  height, startHour, endHour, shifts, hours, appointments, timeOff,
  timezone, color, onSelect, showToday, colorByStaff,
}: {
  height: number;
  startHour: number;
  endHour: number;
  shifts: Array<{ start: string; end: string }>;
  hours?: { open: string; close: string; closed: boolean };
  appointments: CalendarAppointment[];
  timeOff: Array<{ staffId: string | null; from: string; to: string; reason: string | null }>;
  timezone: string;
  color?: string;
  onSelect: (appointment: CalendarAppointment) => void;
  showToday?: boolean;
  colorByStaff?: boolean;
}) {
  const offsetFor = (minutesFromMidnight: number) =>
    (minutesFromMidnight - startHour * 60) * PIXELS_PER_MINUTE;

  // Appointments that overlap in time get split across the column width so
  // neither is hidden behind the other.
  const lanes = assignLanes(appointments, (iso) => localMinutes(iso, timezone));

  return (
    <div
      className="relative border-r border-[var(--color-border)]"
      style={{ height }}
    >
      {/* Hour lines */}
      {Array.from({ length: endHour - startHour }, (_, i) => (
        <div
          key={i}
          className="border-b border-[var(--color-border)]"
          style={{ height: 60 * PIXELS_PER_MINUTE }}
        />
      ))}

      {/* Closed shading */}
      {hours?.closed && (
        <div className="absolute inset-0 bg-[var(--color-surface-2)]/70" />
      )}

      {/* Working hours */}
      {!hours?.closed && shifts.map((shift, i) => (
        <div
          key={i}
          className="absolute inset-x-0 bg-[var(--color-surface)]"
          style={{
            top: offsetFor(hhmmToMinutes(shift.start)),
            height: (hhmmToMinutes(shift.end) - hhmmToMinutes(shift.start)) * PIXELS_PER_MINUTE,
          }}
        />
      ))}

      {/* Off-shift shading sits above the working band so gaps read as closed */}
      {!hours?.closed && shifts.length === 0 && (
        <div className="absolute inset-0 bg-[var(--color-surface-2)]/50" />
      )}

      {/* Breaks and time off */}
      {timeOff.map((block, i) => {
        const from = localMinutes(block.from, timezone);
        const to = localMinutes(block.to, timezone);
        return (
          <div
            key={i}
            title={block.reason ?? 'Unavailable'}
            className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,var(--color-border)_5px,var(--color-border)_10px)]"
            style={{ top: offsetFor(from), height: Math.max((to - from) * PIXELS_PER_MINUTE, 8) }}
          />
        );
      })}

      {/* Now line */}
      {showToday && <NowLine startHour={startHour} endHour={endHour} timezone={timezone} />}

      {/* Appointments */}
      {appointments.map((appointment) => {
        const lane = lanes.get(appointment.id) ?? { index: 0, total: 1 };
        const from = localMinutes(appointment.startsAt, timezone);
        const to = localMinutes(appointment.endsAt, timezone);
        const tone = statusTone(appointment.status);

        const chipColor = colorByStaff
          ? appointment.staffColor || 'var(--color-brand)'
          : color || 'var(--color-brand)';

        const widthPct = 100 / lane.total;

        return (
          <button
            key={appointment.id}
            onClick={() => onSelect(appointment)}
            className={cn(
              'absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left transition-shadow hover:z-10 hover:shadow-md',
              tone.className
            )}
            style={{
              top: offsetFor(from) + 1,
              height: Math.max((to - from) * PIXELS_PER_MINUTE - 2, 22),
              left: `calc(${lane.index * widthPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
              borderLeftColor: tone.dimmed ? 'currentColor' : chipColor,
            }}
          >
            <span className="block truncate text-xs font-medium leading-tight">
              {appointment.clientName}
            </span>
            <span className="block truncate text-[11px] leading-tight opacity-75">
              {appointment.serviceName}
            </span>

            {/* Processing gap: the provider is free here, the chair is not */}
            {appointment.gapStartsAt && appointment.gapEndsAt && (
              <span
                aria-hidden
                title="Processing — provider free"
                className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,currentColor_4px,currentColor_5px)] opacity-25"
                style={{
                  top:
                    (localMinutes(appointment.gapStartsAt, timezone) - from) *
                    PIXELS_PER_MINUTE,
                  height:
                    (localMinutes(appointment.gapEndsAt, timezone) -
                      localMinutes(appointment.gapStartsAt, timezone)) *
                    PIXELS_PER_MINUTE,
                }}
              />
            )}

            {appointment.isNewClient && (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-current" title="New client" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function NowLine({
  startHour, endHour, timezone,
}: {
  startHour: number;
  endHour: number;
  timezone: string;
}) {
  const [minutes, setMinutes] = React.useState(() => localMinutes(new Date().toISOString(), timezone));

  React.useEffect(() => {
    const timer = setInterval(
      () => setMinutes(localMinutes(new Date().toISOString(), timezone)),
      60_000
    );
    return () => clearInterval(timer);
  }, [timezone]);

  if (minutes < startHour * 60 || minutes > endHour * 60) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-[5] border-t-2 border-[var(--color-danger)]"
      style={{ top: (minutes - startHour * 60) * PIXELS_PER_MINUTE }}
    >
      <span className="absolute -left-1 -top-1 size-2 rounded-full bg-[var(--color-danger)]" />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-muted)]">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[var(--color-brand-soft)] ring-1 ring-[var(--color-brand)]" />
        Booked
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[var(--color-success-soft)] ring-1 ring-[var(--color-success)]" />
        Confirmed or done
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[var(--color-danger-soft)] ring-1 ring-[var(--color-danger)]" />
        No-show or cancelled
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,currentColor_2px,currentColor_3px)]" />
        Break or processing time
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-current" />
        New client
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AppointmentDetail({
  appointment, currency, timezone, visitNoun, onClose, onChanged,
}: {
  appointment: CalendarAppointment;
  currency: string;
  timezone: string;
  visitNoun: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const total = appointment.priceCents + appointment.addonsCents;
  const isPast = new Date(appointment.endsAt) < new Date();
  const isOpen = ['requested', 'booked', 'confirmed', 'checked_in', 'in_progress']
    .includes(appointment.status);

  async function setStatus(status: string, label: string) {
    setBusy(status);
    try {
      const res = await fetch(`/api/appointments/${appointment.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not update.');
      toast(label);
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={appointment.clientName}
      description={`${appointment.serviceName} · ${formatDuration(appointment.durationMin)}`}
      footer={
        isOpen ? (
          <>
            {appointment.status !== 'checked_in' && !isPast && (
              <Button
                variant="secondary"
                loading={busy === 'checked_in'}
                onClick={() => setStatus('checked_in', 'Checked in.')}
              >
                Check in
              </Button>
            )}
            {isPast && (
              <Button
                variant="secondary"
                loading={busy === 'no_show'}
                onClick={() => setStatus('no_show', 'Marked as a no-show.')}
              >
                No-show
              </Button>
            )}
            <Button
              loading={busy === 'completed'}
              onClick={() => setStatus('completed', 'Marked complete.')}
            >
              Complete and check out
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(appointment.status).badge} dot>
            {statusLabel(appointment.status)}
          </Badge>
          {appointment.isNewClient && <Badge tone="brand">New client</Badge>}
          {appointment.noShowRisk >= 60 && (
            <Badge tone="warning">No-show risk {appointment.noShowRisk}</Badge>
          )}
          {appointment.depositCents > 0 && (
            <Badge tone={appointment.depositPaid ? 'success' : 'warning'}>
              Deposit {appointment.depositPaid ? 'paid' : 'unpaid'}
            </Badge>
          )}
          {appointment.source === 'rebook_prompt' && (
            <Badge tone="success">Rebooked at checkout</Badge>
          )}
        </div>

        <dl className="space-y-2 text-sm">
          <Row label="When">
            {formatRange(appointment.startsAt, appointment.endsAt, timezone)}
          </Row>
          {appointment.staffName && <Row label="With">{appointment.staffName}</Row>}
          {appointment.clientPhone && (
            <Row label="Phone">
              <a
                href={`tel:${appointment.clientPhone.replace(/\D/g, '')}`}
                className="text-[var(--color-brand)] underline-offset-4 hover:underline"
              >
                {formatPhone(appointment.clientPhone)}
              </a>
            </Row>
          )}
          <Row label="Total">{formatMoney(total, currency)}</Row>
          {appointment.gapStartsAt && (
            <Row label="Processing">
              {formatTime(appointment.gapStartsAt, timezone)} –{' '}
              {formatTime(appointment.gapEndsAt!, timezone)} — you are free during this window
            </Row>
          )}
        </dl>

        {appointment.notes && (
          <div className="rounded-[var(--radius-card)] bg-[var(--color-surface-2)] p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Client note
            </p>
            <p className="mt-1">{appointment.notes}</p>
          </div>
        )}

        {isOpen && !isPast && (
          <Alert tone="brand">
            When you complete this {visitNoun}, checkout opens with the rebooking
            prompt already loaded. Booking the next visit at the chair is worth
            more than any message sent afterwards.
          </Alert>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <a href={`/admin/clients/${appointment.clientId}`}>
            <Button size="sm" variant="secondary">View client</Button>
          </a>
          {isOpen && (
            <a href={`/admin/checkout?appointment=${appointment.id}`}>
              <Button size="sm" variant="secondary">Open checkout</Button>
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusTone(status: string): {
  className: string;
  badge: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
  dimmed?: boolean;
} {
  switch (status) {
    case 'completed':
      return {
        className: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
        badge: 'success',
      };
    case 'confirmed':
    case 'checked_in':
    case 'in_progress':
      return {
        className: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
        badge: 'success',
      };
    case 'cancelled':
    case 'no_show':
    case 'rescheduled':
      return {
        className: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] line-through opacity-70',
        badge: 'danger',
        dimmed: true,
      };
    case 'requested':
      return {
        className: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
        badge: 'warning',
      };
    default:
      return {
        className: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]',
        badge: 'brand',
      };
  }
}

function statusLabel(status: string): string {
  return {
    requested: 'Requested', booked: 'Booked', confirmed: 'Confirmed',
    checked_in: 'Checked in', in_progress: 'In chair', completed: 'Completed',
    cancelled: 'Cancelled', no_show: 'No-show', rescheduled: 'Moved',
  }[status] ?? status;
}

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

function formatRange(from: string, to: string, timeZone: string): string {
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date(from));
  return `${date}, ${formatTime(from, timeZone)} – ${formatTime(to, timeZone)}`;
}
