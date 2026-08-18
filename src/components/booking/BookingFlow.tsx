'use client';

/**
 * ============================================================================
 * BOOKING FLOW
 * ============================================================================
 * Five steps: service → provider → time → extras → details.
 *
 * Conversion notes, since this screen is where revenue is won or lost:
 *   - guest checkout by default; an account is offered after booking, not before
 *   - add-ons appear once, capped at three, after the time is locked in —
 *     asking earlier competes with the decision the client came to make
 *   - the deposit is always explained before it is asked for
 *   - the member-savings prompt uses this booking's real numbers
 *   - the whole thing works on one thumb: nothing critical below the fold,
 *     sticky summary bar, 44px targets
 * ============================================================================
 */

import * as React from 'react';
import { Button, Card, Badge, Input, Field, Alert, Select } from '@/components/ui';
import { formatMoney, formatDuration, cn } from '@/lib/utils';
import type { DemoService, DemoAddon, DemoStaff } from '@/lib/demo';

type Step = 'service' | 'provider' | 'time' | 'extras' | 'details' | 'done';

const STEP_ORDER: Step[] = ['service', 'provider', 'time', 'extras', 'details'];

interface DaySlots {
  date: string;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    staffId: string;
    staffName: string;
    priceCents: number;
    durationMin: number;
  }>;
}

export interface BookingFlowProps {
  services: DemoService[];
  staff: DemoStaff[];
  plans: Array<{ id: string; name: string; price_cents: number; discount_pct: number; included_credits: number }>;
  timezone: string;
  currency: string;
  taxRateBps: number;
  freeCancellationHours: number;
  /** Preselected from a query string, e.g. a "Book" button on the landing page. */
  initialServiceId?: string | null;
  initialStaffId?: string | null;
  /** Demo mode generates slots client-side; live mode hits /api/availability. */
  demoMode: boolean;
  visitNoun: string;
  providerNoun: string;
}

export function BookingFlow(props: BookingFlowProps) {
  const [step, setStep] = React.useState<Step>(
    props.initialServiceId ? 'provider' : 'service'
  );
  const [serviceId, setServiceId] = React.useState<string | null>(
    props.initialServiceId ?? null
  );
  const [staffId, setStaffId] = React.useState<string | null>(
    props.initialStaffId ?? null
  );
  const [slot, setSlot] = React.useState<DaySlots['slots'][number] | null>(null);
  const [addonIds, setAddonIds] = React.useState<string[]>([]);
  const [days, setDays] = React.useState<DaySlots[]>([]);
  const [loadingSlots, setLoadingSlots] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState<{
    reference: string;
    startsAt: string;
    staffName: string;
    rebookIntervalDays: number;
  } | null>(null);

  const [form, setForm] = React.useState({
    firstName: '', lastName: '', email: '', phone: '',
    notes: '', smsOptIn: true, marketingOptIn: false,
  });

  const service = props.services.find((s) => s.id === serviceId) ?? null;
  const selectedAddons = service
    ? service.addons.filter((a) => addonIds.includes(a.id))
    : [];

  // --- Load slots when the service, provider, or add-ons change ------------

  React.useEffect(() => {
    if (step !== 'time' || !service) return;

    let cancelled = false;
    setLoadingSlots(true);

    const fromDate = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams({
      serviceId: service.id, fromDate, days: '21',
      ...(staffId ? { staffId } : {}),
      ...(addonIds.length ? { addonIds: addonIds.join(',') } : {}),
    });

    fetch(`/api/availability?${params}`)
      .then((r) => r.json())
      .then((data: { days?: DaySlots[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setDays(data.days ?? []);
      })
      .catch(() => !cancelled && setError('Could not load available times.'))
      .finally(() => !cancelled && setLoadingSlots(false));

    return () => { cancelled = true; };
  }, [step, service, staffId, addonIds]);

  // --- Derived pricing -----------------------------------------------------

  const basePrice = slot?.priceCents ?? service?.price_cents ?? 0;
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price_cents, 0);
  const subtotal = basePrice + addonsTotal;
  const tax = Math.round((subtotal * props.taxRateBps) / 10_000);
  const total = subtotal + tax;

  const duration =
    (service?.duration_min ?? 0) +
    selectedAddons.reduce((sum, a) => sum + a.duration_min, 0);

  const depositCents = React.useMemo(() => {
    if (!service || service.deposit_mode === 'none') return 0;
    if (service.deposit_mode === 'full') return total;
    if (service.deposit_mode === 'flat') return Math.min(service.deposit_flat_cents, total);
    return Math.round((basePrice * service.deposit_percent) / 100);
  }, [service, basePrice, total]);

  // The membership pitch only appears when this booking alone makes the case.
  const bestPlan = props.plans[0] ?? null;
  const memberPrice = bestPlan
    ? subtotal - Math.round((subtotal * bestPlan.discount_pct) / 100)
    : subtotal;
  const showMembershipPitch =
    bestPlan != null && subtotal - memberPrice > 0 && subtotal >= bestPlan.price_cents / 2;

  // --- Submit --------------------------------------------------------------

  async function submit() {
    if (!service || !slot) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          staffId: slot.staffId,
          startsAt: slot.startsAt,
          addonIds,
          client: form,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');

      setConfirmation({
        reference: data.reference,
        startsAt: slot.startsAt,
        staffName: slot.staffName,
        rebookIntervalDays: service.rebook_interval_days,
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  // --- Confirmation --------------------------------------------------------

  if (step === 'done' && confirmation) {
    return <Confirmation {...confirmation} timezone={props.timezone} visitNoun={props.visitNoun} />;
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32">
      <Progress current={stepIndex} />

      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {/* --- Step 1: service -------------------------------------------- */}
      {step === 'service' && (
        <section aria-labelledby="step-service">
          <h2 id="step-service" className="text-xl font-semibold">
            What are you booking?
          </h2>
          <div className="mt-4 space-y-2">
            {props.services.map((s) => (
              <button
                key={s.id}
                onClick={() => { setServiceId(s.id); setStep('provider'); }}
                className="flex w-full items-start justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:border-[var(--color-brand)]"
              >
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                    {formatDuration(s.duration_min)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{s.description}</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {s.price_cents === 0 ? 'Free' : formatMoney(s.price_cents, props.currency)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* --- Step 2: provider -------------------------------------------- */}
      {step === 'provider' && service && (
        <section aria-labelledby="step-provider">
          <h2 id="step-provider" className="text-xl font-semibold">
            Who would you like to see?
          </h2>
          <div className="mt-4 space-y-2">
            <button
              onClick={() => { setStaffId(null); setStep('time'); }}
              className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:border-[var(--color-brand)]"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]" aria-hidden>
                ★
              </span>
              <span>
                <span className="block font-medium">
                  Any available {props.providerNoun}
                </span>
                <span className="block text-sm text-[var(--color-muted)]">
                  Usually the most times to choose from
                </span>
              </span>
            </button>

            {props.staff.map((member) => (
              <button
                key={member.id}
                onClick={() => { setStaffId(member.id); setStep('time'); }}
                className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:border-[var(--color-brand)]"
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ background: member.color }}
                  aria-hidden
                >
                  {member.display_name.split(' ').map((w) => w[0]).join('')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{member.display_name}</span>
                  <span className="block text-sm text-[var(--color-muted)]">{member.title}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-[var(--color-muted)]">
                  {formatMoney(
                    Math.round(service.price_cents * member.price_multiplier),
                    props.currency
                  )}
                </span>
              </button>
            ))}
          </div>
          <BackButton onClick={() => setStep('service')} />
        </section>
      )}

      {/* --- Step 3: time ------------------------------------------------- */}
      {step === 'time' && service && (
        <section aria-labelledby="step-time">
          <h2 id="step-time" className="text-xl font-semibold">Pick a time</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {formatDuration(duration)}
            {staffId && ` · ${props.staff.find((s) => s.id === staffId)?.display_name}`}
          </p>

          {loadingSlots ? (
            <p className="mt-8 text-center text-sm text-[var(--color-muted)]">
              Loading available times…
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {days.filter((d) => d.slots.length > 0).length === 0 && (
                <Alert tone="neutral">
                  No times available in the next three weeks. Try another{' '}
                  {props.providerNoun}, or call us and we will find something.
                </Alert>
              )}

              {days.filter((d) => d.slots.length > 0).map((day) => (
                <div key={day.date}>
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold">
                      {formatDayHeading(day.date, props.timezone)}
                    </h3>
                    {day.slots.length <= 3 && (
                      <Badge tone="warning">
                        {day.slots.length} left
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dedupeSlots(day.slots).map((s) => (
                      <button
                        key={`${s.startsAt}-${s.staffId}`}
                        onClick={() => { setSlot(s); setStep('extras'); }}
                        className={cn(
                          'rounded-[var(--radius-card)] border px-3 py-2.5 text-sm tabular-nums transition-colors',
                          'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]',
                          slot?.startsAt === s.startsAt && 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                        )}
                      >
                        {formatTime(s.startsAt, props.timezone)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <BackButton onClick={() => setStep('provider')} />
        </section>
      )}

      {/* --- Step 4: add-ons ---------------------------------------------- */}
      {step === 'extras' && service && (
        <section aria-labelledby="step-extras">
          <h2 id="step-extras" className="text-xl font-semibold">
            Anything to add?
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Optional — we can also decide at your {props.visitNoun}.
          </p>

          <div className="mt-4 space-y-2">
            {service.addons.slice(0, 3).map((addon) => {
              const checked = addonIds.includes(addon.id);
              return (
                <label
                  key={addon.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border p-4 transition-colors',
                    checked
                      ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setAddonIds((prev) =>
                        checked ? prev.filter((id) => id !== addon.id) : [...prev, addon.id]
                      )
                    }
                    className="mt-1 size-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{addon.name}</span>
                      {addon.is_recommended && <Badge tone="accent">Popular</Badge>}
                    </span>
                    <span className="block text-sm text-[var(--color-muted)]">
                      +{formatDuration(addon.duration_min)}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    +{formatMoney(addon.price_cents, props.currency)}
                  </span>
                </label>
              );
            })}
          </div>

          {showMembershipPitch && bestPlan && (
            <div className="mt-5">
              <Alert tone="brand" title={`Members pay ${formatMoney(memberPrice, props.currency)} for this`}>
                <p className="mt-1">
                  {bestPlan.name} is {formatMoney(bestPlan.price_cents, props.currency)}/month
                  and includes {bestPlan.included_credits} visit
                  {bestPlan.included_credits === 1 ? '' : 's'} plus {bestPlan.discount_pct}% off
                  everything else. You can add it after booking.
                </p>
              </Alert>
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <Button onClick={() => setStep('details')} fullWidth>
              Continue
            </Button>
          </div>
          <BackButton onClick={() => setStep('time')} />
        </section>
      )}

      {/* --- Step 5: details ---------------------------------------------- */}
      {step === 'details' && service && slot && (
        <section aria-labelledby="step-details">
          <h2 id="step-details" className="text-xl font-semibold">Your details</h2>

          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" required htmlFor="firstName">
                <Input
                  id="firstName" required autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </Field>
              <Field label="Last name" htmlFor="lastName">
                <Input
                  id="lastName" autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </Field>
            </div>

            <Field
              label="Mobile number" required htmlFor="phone"
              hint="We text your confirmation and a reminder before your visit."
            >
              <Input
                id="phone" type="tel" required autoComplete="tel" inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>

            <Field label="Email" required htmlFor="email">
              <Input
                id="email" type="email" required autoComplete="email" inputMode="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>

            <Field label={`Anything we should know?`} htmlFor="notes">
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional"
              />
            </Field>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox" className="mt-0.5 size-4"
                checked={form.marketingOptIn}
                onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })}
              />
              <span className="text-[var(--color-muted)]">
                Send me occasional offers and reminders when I&apos;m due for a visit.
              </span>
            </label>

            {depositCents > 0 && (
              <Alert tone="warning" title={`${formatMoney(depositCents, props.currency)} deposit`}>
                <p className="mt-1">
                  This service holds a deposit, which comes off your total. It is fully
                  refundable with {props.freeCancellationHours} hours notice.
                </p>
              </Alert>
            )}

            <Button type="submit" fullWidth size="lg" loading={submitting}>
              {depositCents > 0
                ? `Pay deposit and book`
                : `Confirm ${props.visitNoun}`}
            </Button>

            <p className="text-center text-xs text-[var(--color-muted)]">
              Free changes up to {props.freeCancellationHours} hours before.
            </p>
          </form>
          <BackButton onClick={() => setStep('extras')} />
        </section>
      )}

      {/* --- Sticky summary ---------------------------------------------- */}
      {service && step !== 'service' && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{service.name}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">
                {slot
                  ? `${formatDayHeading(slot.startsAt.slice(0, 10), props.timezone)}, ${formatTime(slot.startsAt, props.timezone)} · ${slot.staffName}`
                  : formatDuration(duration)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">
                {formatMoney(total, props.currency)}
              </p>
              {addonsTotal > 0 && (
                <p className="text-xs text-[var(--color-muted)]">
                  incl. {formatMoney(addonsTotal, props.currency)} extras
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---------------------------------------------------------

function Progress({ current }: { current: number }) {
  const labels = ['Service', 'Provider', 'Time', 'Extras', 'Details'];
  return (
    <ol className="mb-6 flex items-center gap-1" aria-label="Booking progress">
      {labels.map((label, i) => (
        <li key={label} className="flex flex-1 flex-col gap-1.5">
          <span
            className={cn(
              'h-1 rounded-full transition-colors',
              i <= current ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-border)]'
            )}
          />
          <span
            className={cn(
              'hidden text-xs sm:block',
              i === current ? 'font-medium text-[var(--color-fg)]' : 'text-[var(--color-muted)]'
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-6 text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
    >
      ← Back
    </button>
  );
}

function Confirmation({
  reference, startsAt, staffName, rebookIntervalDays, timezone, visitNoun,
}: {
  reference: string;
  startsAt: string;
  staffName: string;
  rebookIntervalDays: number;
  timezone: string;
  visitNoun: string;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-2xl text-[var(--color-success)]">
        ✓
      </div>
      <h2 className="mt-4 text-2xl font-semibold">You&apos;re booked</h2>
      <p className="mt-2 text-[var(--color-muted)]">
        {formatDayHeading(startsAt.slice(0, 10), timezone)} at{' '}
        {formatTime(startsAt, timezone)} with {staffName}.
      </p>

      <Card className="mt-6 p-5 text-left">
        <p className="text-sm text-[var(--color-muted)]">Confirmation</p>
        <p className="font-mono text-lg">{reference}</p>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          We&apos;ve sent a confirmation and will text you a reminder before your{' '}
          {visitNoun}.
        </p>
      </Card>

      {/* The rebooking seed. Planting the interval now makes the nudge in a
          few weeks feel expected rather than like marketing. */}
      <Alert tone="brand" title="One thing to know">
        <p className="mt-1">
          Most clients come back in about {rebookIntervalDays} days. We&apos;ll remind
          you when you&apos;re due so the time you want is still open.
        </p>
      </Alert>

      <div className="mt-6 flex flex-col gap-2">
        <a href="/account">
          <Button fullWidth variant="secondary">View my {visitNoun}s</Button>
        </a>
        <a href="/">
          <Button fullWidth variant="ghost">Back to home</Button>
        </a>
      </div>
    </div>
  );
}

// --- Helpers ----------------------------------------------------------------

/** One button per start time; the picker should read as times, not people. */
function dedupeSlots(slots: DaySlots['slots']): DaySlots['slots'] {
  const seen = new Map<string, DaySlots['slots'][number]>();
  for (const s of slots) if (!seen.has(s.startsAt)) seen.set(s.startsAt, s);
  return [...seen.values()];
}

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

function formatDayHeading(date: string, timeZone: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const today = new Date();
  const diff = Math.round(
    (d.getTime() - new Date(today.toISOString().slice(0, 10) + 'T12:00:00Z').getTime()) / 86_400_000
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'long', month: 'short', day: 'numeric',
  }).format(d);
}
