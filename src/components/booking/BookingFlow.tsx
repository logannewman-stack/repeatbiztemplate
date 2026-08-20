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
import { Button, Card, Badge, Input, Field, Alert } from '@/components/ui';
import { formatMoney, formatDuration, cn } from '@/lib/utils';
import type { DemoService, DemoAddon, DemoStaff } from '@/lib/demo';
import { DatePicker } from '@/components/booking/DatePicker';
import { tintFor } from '@/components/app';

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
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
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
    setSelectedDate(null);

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

  const openDays = React.useMemo(
    () => days.filter((d) => d.slots.length > 0),
    [days]
  );

  // Default to the first day with anything open, so the grid is never empty
  // on arrival — an empty time list reads as "fully booked".
  const activeDate = selectedDate ?? openDays[0]?.date ?? null;

  const activeSlots = React.useMemo(() => {
    const day = days.find((d) => d.date === activeDate);
    return day ? dedupeSlots(day.slots) : [];
  }, [days, activeDate]);

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
          <h2 id="step-service" className="font-[family-name:var(--font-body)] text-[15px] font-semibold">
            What are you booking?
          </h2>

          {/* One grouped card rather than a stack of tall ones. A real salon
              menu runs to twenty services; at the old density two filled the
              screen and the description outweighed the price. */}
          <div className="mt-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
            <div className="divide-y divide-[var(--color-border)]">
              {props.services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setServiceId(s.id); setStep('provider'); }}
                  data-press="row"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--color-surface-2)]"
                >
                  <span
                    aria-hidden
                    className="flex size-11 shrink-0 items-center justify-center rounded-[0.6rem]"
                    style={tintFor(s.name)}
                  >
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d="M12 3.6 13.5 9l5.4 1.6-5.4 1.6L12 17.6l-1.5-5.4L5.1 10.6 10.5 9z" />
                    </svg>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] leading-tight">{s.name}</span>
                    <span className="mt-0.5 block text-[13px] text-[var(--color-muted)]">
                      {formatDuration(s.duration_min)}
                    </span>
                    {s.description && (
                      <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--color-muted)]">
                        {s.description}
                      </span>
                    )}
                  </span>

                  <span className="shrink-0 text-[17px] font-semibold tabular-nums">
                    {s.price_cents === 0 ? 'Free' : formatMoney(s.price_cents, props.currency)}
                  </span>

                  <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden
                    className="shrink-0 text-[var(--color-muted)] opacity-60"
                    fill="none" stroke="currentColor" strokeWidth={2}
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.2 1.2 6.6 7l-5.4 5.8" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* --- Step 2: provider -------------------------------------------- */}
      {step === 'provider' && service && (
        <section aria-labelledby="step-provider">
          <h2 id="step-provider" className="font-[family-name:var(--font-body)] text-[15px] font-semibold">
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
          <h2 id="step-time" className="font-[family-name:var(--font-body)] text-[15px] font-semibold">Pick a time</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {formatDuration(duration)}
            {staffId && ` · ${props.staff.find((s) => s.id === staffId)?.display_name}`}
          </p>

          {loadingSlots ? (
            <div className="mt-6 space-y-3" aria-busy>
              <div className="flex gap-2">
                {Array.from({ length: 7 }, (_, i) => (
                  <div
                    key={i}
                    className="h-16 w-16 shrink-0 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-surface-2)]"
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <div
                    key={i}
                    className="h-11 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-surface-2)]"
                  />
                ))}
              </div>
            </div>
          ) : openDays.length === 0 ? (
            <Alert tone="neutral" className="mt-4">
              No times available in the next three weeks. Try another{' '}
              {props.providerNoun}, or give us a call and we will find something.
            </Alert>
          ) : (
            <div className="mt-4 space-y-5">
              <DatePicker
                days={days.map((d) => ({
                  date: d.date,
                  slotCount: dedupeSlots(d.slots).length,
                }))}
                selected={activeDate}
                onSelect={setSelectedDate}
                timezone={props.timezone}
              />

              {activeSlots.length > 0 && (
                <div>
                  <h3 className="font-[family-name:var(--font-body)] text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">
                    {activeSlots.length} time{activeSlots.length === 1 ? '' : 's'} available
                  </h3>

                  {/* Chunkier than a text button: this is the tap that turns a
                      browser into a booking, and it competes with a thumb. */}
                  <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {activeSlots.map((s) => (
                      <button
                        key={`${s.startsAt}-${s.staffId}`}
                        onClick={() => { setSlot(s); setStep('extras'); }}
                        data-press
                        className={cn(
                          'flex min-h-[52px] flex-col items-center justify-center rounded-[var(--radius-card)] px-1.5 py-2.5 tabular-nums transition-colors',
                          slot?.startsAt === s.startsAt
                            ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] shadow-[var(--shadow-md)]'
                            : 'bg-[var(--color-surface)] shadow-[var(--shadow-sm)]'
                        )}
                      >
                        <span className="text-[15px] font-semibold leading-none">
                          {formatTime(s.startsAt, props.timezone)}
                        </span>
                        {!staffId && (
                          <span className="mt-1 w-full truncate text-[11px] font-normal leading-none opacity-65">
                            {s.staffName.split(' ')[0]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <BackButton onClick={() => setStep('provider')} />
        </section>
      )}

      {/* --- Step 4: add-ons ---------------------------------------------- */}
      {step === 'extras' && service && (
        <section aria-labelledby="step-extras">
          <h2 id="step-extras" className="font-[family-name:var(--font-body)] text-[15px] font-semibold">
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
          <h2 id="step-details" className="font-[family-name:var(--font-body)] text-[15px] font-semibold">Your details</h2>

          {/* The summary this step was missing entirely. Handing over a phone
              number with no reminder of what is being booked, when, or what it
              costs is the last place to lose someone — and the total was
              already computed, just never shown. */}
          <div className="mt-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
            <div className="px-4 pb-3 pt-3.5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-brand)]">
                {new Intl.DateTimeFormat('en-US', {
                  timeZone: props.timezone,
                  weekday: 'long', month: 'short', day: 'numeric',
                }).format(new Date(slot.startsAt))}
                {' · '}
                {formatTime(slot.startsAt, props.timezone)}
              </p>
              <p className="mt-1 text-[17px] font-semibold leading-tight">
                {service.name}
              </p>
              <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
                {formatDuration(service.duration_min)}
                {slot.staffName ? ` · with ${slot.staffName}` : ''}
              </p>
            </div>

            <dl className="border-t border-[var(--color-border)] px-4 py-3 text-[15px]">
              <div className="flex justify-between gap-4 py-0.5">
                <dt className="min-w-0 truncate text-[var(--color-muted)]">{service.name}</dt>
                <dd className="shrink-0 tabular-nums">{formatMoney(basePrice, props.currency)}</dd>
              </div>

              {selectedAddons.map((a) => (
                <div key={a.id} className="flex justify-between gap-4 py-0.5">
                  <dt className="min-w-0 truncate text-[var(--color-muted)]">{a.name}</dt>
                  <dd className="shrink-0 tabular-nums">{formatMoney(a.price_cents, props.currency)}</dd>
                </div>
              ))}

              {tax > 0 && (
                <div className="flex justify-between gap-4 py-0.5">
                  <dt className="text-[var(--color-muted)]">Tax</dt>
                  <dd className="shrink-0 tabular-nums">{formatMoney(tax, props.currency)}</dd>
                </div>
              )}

              <div className="mt-1.5 flex justify-between gap-4 border-t border-[var(--color-border)] pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(total, props.currency)}</dd>
              </div>

              {depositCents > 0 && (
                <div className="flex justify-between gap-4 pt-1 text-[13px] text-[var(--color-muted)]">
                  <dt>Due now</dt>
                  <dd className="tabular-nums">{formatMoney(depositCents, props.currency)}</dd>
                </div>
              )}
            </dl>
          </div>

          <form
            className="mt-4 space-y-3.5"
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <div className="space-y-3 rounded-[var(--radius-card)] bg-[var(--color-surface)] px-4 py-3.5 shadow-[var(--shadow-md)]">
            <div className="grid gap-3 sm:grid-cols-2">
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

            </div>

            <label className="flex items-start gap-2.5 rounded-[var(--radius-card)] bg-[var(--color-surface)] px-4 py-3 text-[13px] shadow-[var(--shadow-sm)]">
              <input
                type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
                checked={form.marketingOptIn}
                onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })}
              />
              <span className="leading-snug text-[var(--color-muted)]">
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
    <div className="mb-5" aria-label="Booking progress">
      <ol className="flex items-center gap-1">
        {labels.map((label, i) => (
          <li
            key={label}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= current ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-border)]'
            )}
          />
        ))}
      </ol>

      {/* The labels used to be hidden below the sm breakpoint, which on a
          phone — where almost all of this traffic is — left five anonymous
          bars and no sense of how much was left. */}
      <p className="mt-2 font-[family-name:var(--font-body)] text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">
        Step {current + 1} of {labels.length}
        <span className="text-[var(--color-brand)]"> &middot; {labels[current]}</span>
      </p>
    </div>
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
