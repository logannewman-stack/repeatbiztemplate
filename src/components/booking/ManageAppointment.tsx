'use client';

/**
 * ============================================================================
 * MANAGE APPOINTMENT
 * ============================================================================
 * What a client sees when they follow "need to change this?" from a reminder.
 *
 * The whole screen is built around one asymmetry: a rescheduled appointment
 * keeps the revenue and the relationship; a cancelled one usually loses both.
 * So reschedule is the primary action, cancelling is a quiet secondary, and
 * choosing to cancel still routes through reschedule options first.
 *
 * No fee is ever charged without being shown first. The API enforces that too
 * — it returns the amount and refuses until it is acknowledged.
 * ============================================================================
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, CardBody, CardHeader, Badge, Alert, Divider, Field, Textarea,
} from '@/components/ui';
import { cn, formatMoney } from '@/lib/utils';

interface AppointmentInfo {
  id: string;
  serviceId: string;
  serviceName: string;
  staffId: string | null;
  staffName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  priceCents: number;
  addonsCents: number;
  addons: Array<{ name: string; priceCents: number }>;
  clientFirstName: string;
}

interface Policy {
  freeCancellationHours: number;
  rescheduleFirst: boolean;
  cancellationFeeCents: number;
  cancellationExplanation: string | null;
  cancellationIsFree: boolean;
  rescheduleFeeCents: number;
  rescheduleIsFree: boolean;
  rescheduleExplanation: string | null;
  freeReschedulesLeft: number;
}

type Mode = 'overview' | 'reschedule' | 'cancel' | 'done';

export function ManageAppointment({
  appointment, policy, timezone, currency, visitNoun, phone,
}: {
  appointment: AppointmentInfo;
  policy: Policy;
  timezone: string;
  currency: string;
  visitNoun: string;
  phone: string;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>('overview');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<{
    kind: 'rescheduled' | 'cancelled'; message: string;
  } | null>(null);

  const [days, setDays] = React.useState<
    Array<{ date: string; slots: Array<{ startsAt: string; staffId: string; staffName: string }> }>
  >([]);
  const [loadingSlots, setLoadingSlots] = React.useState(false);
  const [picked, setPicked] = React.useState<{ startsAt: string; staffId: string } | null>(null);
  const [reason, setReason] = React.useState('');

  const total = appointment.priceCents + appointment.addonsCents;

  React.useEffect(() => {
    if (mode !== 'reschedule') return;

    setLoadingSlots(true);
    const params = new URLSearchParams({
      serviceId: appointment.serviceId,
      fromDate: new Date().toISOString().slice(0, 10),
      days: '21',
      ...(appointment.staffId ? { staffId: appointment.staffId } : {}),
    });

    fetch(`/api/availability?${params}`)
      .then((r) => r.json())
      .then((data) => setDays(data.days ?? []))
      .catch(() => setError('Could not load available times.'))
      .finally(() => setLoadingSlots(false));
  }, [mode, appointment.serviceId, appointment.staffId]);

  const fmtDateTime = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));

  const fmtDay = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'long', month: 'short', day: 'numeric',
    }).format(new Date(`${date}T12:00:00Z`));

  async function doReschedule() {
    if (!picked) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/appointments/${appointment.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startsAt: picked.startsAt,
          staffId: picked.staffId,
          // The fee was shown on this screen before the button was enabled.
          acknowledgedFee: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not move the appointment.');

      setOutcome({
        kind: 'rescheduled',
        message: `Moved to ${fmtDateTime(picked.startsAt)}.`,
      });
      setMode('done');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move the appointment.');
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/appointments/${appointment.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, acknowledgedFee: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not cancel.');

      setOutcome({
        kind: 'cancelled',
        message:
          data.feeCents > 0
            ? `Cancelled. A ${formatMoney(data.feeCents, currency)} fee was applied.`
            : 'Cancelled. No fee.',
      });
      setMode('done');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  // --- Done ----------------------------------------------------------------

  if (mode === 'done' && outcome) {
    return (
      <div className="space-y-5 text-center">
        <div
          className={cn(
            'mx-auto flex size-14 items-center justify-center rounded-full text-2xl',
            outcome.kind === 'rescheduled'
              ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
              : 'bg-[var(--color-surface-2)] text-[var(--color-muted)]'
          )}
        >
          {outcome.kind === 'rescheduled' ? '✓' : '·'}
        </div>
        <h1 className="text-2xl font-bold">
          {outcome.kind === 'rescheduled' ? 'All moved' : 'Cancelled'}
        </h1>
        <p className="text-[var(--color-muted)]">{outcome.message}</p>

        {outcome.kind === 'cancelled' && (
          <Alert tone="brand" className="text-left">
            Changed your mind? Booking again takes under a minute, and the time
            you want is more likely to be open now than later.
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <a href="/book">
            <Button fullWidth size="lg">Book a {visitNoun}</Button>
          </a>
          <a href="/account">
            <Button fullWidth variant="secondary">My {visitNoun}s</Button>
          </a>
        </div>
      </div>
    );
  }

  // --- Overview ------------------------------------------------------------

  if (mode === 'overview') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Your {visitNoun}</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Hi {appointment.clientFirstName} — here is what you have booked.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <Card>
          <CardBody className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{appointment.serviceName}</p>
                <p className="mt-1 text-[var(--color-muted)]">
                  {fmtDateTime(appointment.startsAt)}
                </p>
                {appointment.staffName && (
                  <p className="text-[var(--color-muted)]">
                    with {appointment.staffName}
                  </p>
                )}
              </div>
              <Badge tone={appointment.status === 'confirmed' ? 'success' : 'neutral'} dot>
                {appointment.status === 'confirmed' ? 'Confirmed' : 'Booked'}
              </Badge>
            </div>

            {appointment.addons.length > 0 && (
              <>
                <Divider className="my-4" />
                <ul className="space-y-1 text-sm">
                  {appointment.addons.map((addon) => (
                    <li key={addon.name} className="flex justify-between">
                      <span className="text-[var(--color-muted)]">{addon.name}</span>
                      <span className="tabular-nums">
                        {formatMoney(addon.priceCents, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Divider className="my-4" />

            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(total, currency)}</span>
            </div>
          </CardBody>
        </Card>

        {/* Reschedule is the primary action, deliberately */}
        <div className="space-y-2">
          <Button fullWidth size="lg" onClick={() => setMode('reschedule')}>
            Change my time
          </Button>

          {policy.rescheduleIsFree ? (
            <p className="text-center text-xs text-[var(--color-muted)]">
              Free to move
              {policy.freeReschedulesLeft === 1
                ? ' — one free change left'
                : policy.freeReschedulesLeft > 1
                  ? ` — ${policy.freeReschedulesLeft} free changes left`
                  : ''}
              .
            </p>
          ) : (
            <p className="text-center text-xs text-[var(--color-warning)]">
              {policy.rescheduleExplanation}
            </p>
          )}
        </div>

        <Divider />

        <div className="text-center">
          <button
            onClick={() => setMode(policy.rescheduleFirst ? 'reschedule' : 'cancel')}
            className="text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
          >
            I need to cancel
          </button>
        </div>

        <p className="text-center text-xs text-[var(--color-muted)]">
          Questions? Call us at{' '}
          <a href={`tel:${phone.replace(/\D/g, '')}`} className="underline">
            {phone}
          </a>
          .
        </p>
      </div>
    );
  }

  // --- Reschedule ----------------------------------------------------------

  if (mode === 'reschedule') {
    const openDays = days.filter((d) => d.slots.length > 0);

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Pick a new time</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Currently {fmtDateTime(appointment.startsAt)}.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {!policy.rescheduleIsFree && policy.rescheduleExplanation && (
          <Alert tone="warning" title="Heads up">
            {policy.rescheduleExplanation} That is{' '}
            {formatMoney(policy.rescheduleFeeCents, currency)}.
          </Alert>
        )}

        {loadingSlots ? (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            Finding available times…
          </p>
        ) : openDays.length === 0 ? (
          <Alert tone="neutral">
            Nothing open in the next three weeks. Give us a call on{' '}
            <a href={`tel:${phone.replace(/\D/g, '')}`} className="underline">{phone}</a>{' '}
            and we will sort something out.
          </Alert>
        ) : (
          <div className="space-y-5">
            {openDays.slice(0, 14).map((day) => (
              <div key={day.date}>
                <h2 className="text-sm font-semibold">{fmtDay(day.date)}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {dedupe(day.slots).map((slot) => (
                    <button
                      key={slot.startsAt}
                      onClick={() => setPicked({ startsAt: slot.startsAt, staffId: slot.staffId })}
                      className={cn(
                        'rounded-[var(--radius-card)] border px-3 py-2.5 text-sm tabular-nums transition-colors',
                        picked?.startsAt === slot.startsAt
                          ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                          : 'border-[var(--color-border)] hover:border-[var(--color-brand)]'
                      )}
                    >
                      {fmtTime(slot.startsAt)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="sticky bottom-0 space-y-2 bg-[var(--color-bg)] py-3">
          <Button
            fullWidth size="lg" loading={busy} disabled={!picked}
            onClick={doReschedule}
          >
            {picked ? `Move to ${fmtTime(picked.startsAt)}` : 'Pick a time'}
          </Button>
          <div className="flex justify-between">
            <button
              onClick={() => setMode('overview')}
              className="text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
            >
              ← Back
            </button>
            <button
              onClick={() => setMode('cancel')}
              className="text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
            >
              Cancel instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Cancel --------------------------------------------------------------

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Cancel this {visitNoun}?</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          {fmtDateTime(appointment.startsAt)}
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {policy.cancellationIsFree ? (
        <Alert tone="neutral">
          You are outside the {policy.freeCancellationHours}-hour window, so
          there is no charge.
        </Alert>
      ) : (
        <Alert tone="warning" title={`${formatMoney(policy.cancellationFeeCents, currency)} fee`}>
          {policy.cancellationExplanation}
        </Alert>
      )}

      {/* One more chance to keep the booking, stated as a benefit not a plea */}
      <Card>
        <CardHeader
          title="Would moving it work instead?"
          description={
            policy.rescheduleIsFree
              ? 'Changing your time is free, and keeps your spot.'
              : 'Moving it costs less than cancelling.'
          }
        />
        <CardBody>
          <Button fullWidth variant="secondary" onClick={() => setMode('reschedule')}>
            See other times
          </Button>
        </CardBody>
      </Card>

      <Field
        label="Anything we could have done better?"
        hint="Optional, and it goes straight to the owner."
      >
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional"
        />
      </Field>

      <div className="space-y-2">
        <Button
          fullWidth variant="danger" loading={busy} onClick={doCancel}
        >
          {policy.cancellationIsFree
            ? `Cancel my ${visitNoun}`
            : `Cancel and accept the ${formatMoney(policy.cancellationFeeCents, currency)} fee`}
        </Button>
        <button
          onClick={() => setMode('overview')}
          className="w-full text-center text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
        >
          Keep my {visitNoun}
        </button>
      </div>
    </div>
  );
}

function dedupe<T extends { startsAt: string }>(slots: T[]): T[] {
  const seen = new Map<string, T>();
  for (const slot of slots) if (!seen.has(slot.startsAt)) seen.set(slot.startsAt, slot);
  return [...seen.values()];
}
