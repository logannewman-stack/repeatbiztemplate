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
import Link from 'next/link';
import { Alert, Badge, Button, ButtonLink, Card, Field, Input } from '@/components/ui';
import { formatMoney, formatDuration, cn } from '@/lib/utils';
import type { DemoService, DemoAddon, DemoStaff } from '@/lib/demo';
import { DatePicker } from '@/components/booking/DatePicker';
import { Screen, haptic, tintFor } from '@/components/app';

type Step = 'service' | 'provider' | 'time' | 'extras' | 'details' | 'done';

const STEP_ORDER: Step[] = ['service', 'provider', 'time', 'extras', 'details'];

/**
 * The nav bar names the step, not the flow. "Book appointment" on every screen
 * tells someone on step four nothing they do not already know; "Your details"
 * tells them exactly how much is left.
 */
/** So the pinned bar's submit button can drive the form it sits outside of. */
const DETAILS_FORM_ID = 'booking-details';

const STEP_TITLES: Record<Step, string> = {
  service: 'What are you booking?',
  provider: 'Who would you like?',
  time: 'Pick a time',
  extras: 'Anything to add?',
  details: 'Your details',
  done: 'Booked',
};

/** The one line under the title that a person actually needs on each step. */
const STEP_SUBTITLES = (props: {
  providerNoun: string; visitNoun: string;
}): Partial<Record<Step, string>> => ({
  provider: `Someone you have seen before, or whichever ${props.providerNoun} is free.`,
  extras: `Optional — we can also decide at your ${props.visitNoun}.`,
});

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
  /** "Book my next visit" — the words used on every rebooking prompt. */
  rebookCta: string;
  /** Appears in the calendar file the client saves, so it is theirs, not ours. */
  businessName: string;
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
    endsAt: string;
    staffName: string;
    serviceId: string;
    serviceName: string;
    rebookIntervalDays: number;
  } | null>(null);

  const [form, setForm] = React.useState({
    firstName: '', lastName: '', email: '', phone: '',
    notes: '', smsOptIn: true, marketingOptIn: false,
  });

  // Each step is a new screen, and a new screen starts at the top. Without
  // this a tall service list leaves you halfway down the next step, which is
  // the single clearest tell that a flow is a web page.
  React.useEffect(() => {
    document.querySelector('.app-scroll')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

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

  // Naming the provider under every chip only helps when there is a choice to
  // be made. One name repeated fourteen times is just noise on the chip that
  // matters most — and the comparison is on the *label* we would draw, so
  // three people all shown as "Provider" still count as one.
  const showSlotStaff = React.useMemo(
    () => !staffId
      && new Set(activeSlots.map((s) => staffLabel(s.staffName))).size > 1,
    [staffId, activeSlots]
  );

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
        endsAt: new Date(
          new Date(slot.startsAt).getTime() + service.duration_min * 60_000
        ).toISOString(),
        staffName: slot.staffName,
        serviceId: service.id,
        serviceName: service.name,
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
    return (
      <Screen title={STEP_TITLES.done} largeTitle={false}>
        <Confirmation
          {...confirmation}
          timezone={props.timezone}
          visitNoun={props.visitNoun}
          rebookCta={props.rebookCta}
          businessName={props.businessName}
        />
      </Screen>
    );
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const previous = stepIndex > 0 ? STEP_ORDER[stepIndex - 1] : null;

  return (
    <Screen
      title={STEP_TITLES[step]}
      subtitle={
        step === 'time'
          ? `${formatDuration(duration)}${staffId ? ` · ${props.staff.find((s) => s.id === staffId)?.display_name}` : ''}`
          : STEP_SUBTITLES(props)[step]
      }
      back={
        previous
          ? { onClick: () => setStep(previous), label: STEP_TITLES[previous] }
          : { href: '/', label: 'Home' }
      }
      footer={
        service && step !== 'service' ? (
          <SummaryBar
            service={service}
            slot={slot}
            duration={duration}
            total={total}
            addonsTotal={addonsTotal}
            currency={props.currency}
            timezone={props.timezone}
            // The bar carries the step's action, so the primary control is
            // always in thumb reach instead of below four form fields.
            action={
              step === 'extras' ? (
                <Button onClick={() => setStep('details')} size="lg">
                  Continue
                </Button>
              ) : step === 'details' ? (
                <Button
                  type="submit"
                  form={DETAILS_FORM_ID}
                  size="lg"
                  loading={submitting}
                >
                  {depositCents > 0 ? 'Pay and book' : 'Confirm'}
                </Button>
              ) : undefined
            }
          />
        ) : undefined
      }
    >
    <div className="mx-auto max-w-3xl px-4 pt-2">
      <Progress current={stepIndex} />

      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {/* --- Step 1: service -------------------------------------------- */}
      {step === 'service' && (
        <section aria-label="Services">
          {/* Grouped cards rather than a stack of tall ones. A real salon menu
              runs to twenty services; at the old density two filled the screen
              and the description outweighed the price. */}
          <div className="mt-1 space-y-5">
            {groupByCategory(props.services).map((group) => (
              <div key={group.label || '_'}>
                {group.label && (
                  <h3 className="px-1 pb-1.5 font-[family-name:var(--font-body)] text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">
                    {group.label}
                  </h3>
                )}
                <div className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
                  <div className="divide-y divide-[var(--color-border)]">
                    {group.services.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setServiceId(s.id); setStep('provider'); }}
                        data-press="row"
                        className="flex min-h-[var(--tap-min)] w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--color-surface-2)]"
                      >
                        <span
                          aria-hidden
                          className="flex size-10 shrink-0 items-center justify-center rounded-[0.6rem]"
                          style={tintFor(s.name)}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"
                            strokeLinejoin="round">
                            <path d="M12 3.6 13.5 9l5.4 1.6-5.4 1.6L12 17.6l-1.5-5.4L5.1 10.6 10.5 9z" />
                          </svg>
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[17px] leading-tight">{s.name}</span>
                          {/* Duration and blurb share one clamped line. Two
                              lines of description per row meant five services
                              filled a phone; a real menu has twenty. */}
                          <span className="mt-0.5 block truncate text-[13px] text-[var(--color-muted)]">
                            {formatDuration(s.duration_min)}
                            {s.description ? ` · ${s.description}` : ''}
                          </span>
                        </span>

                        <span className="shrink-0 text-[17px] font-semibold tabular-nums">
                          {s.price_cents === 0 ? 'Free' : formatMoney(s.price_cents, props.currency)}
                        </span>

                        <Chevron />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- Step 2: provider -------------------------------------------- */}
      {step === 'provider' && service && (
        <section aria-label="Providers">
          <div className="mt-1 space-y-2">
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
        </section>
      )}

      {/* --- Step 3: time ------------------------------------------------- */}
      {step === 'time' && service && (
        <section aria-label="Available times">
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
                <div className="space-y-4">
                  {groupByPartOfDay(activeSlots, props.timezone).map((group) => (
                    <div key={group.label}>
                      <h3 className="flex items-baseline justify-between gap-3 font-[family-name:var(--font-body)] text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">
                        <span>{group.label}</span>
                        <span className="font-normal normal-case tracking-normal">
                          {group.slots.length} time{group.slots.length === 1 ? '' : 's'}
                        </span>
                      </h3>

                      {/* Chunkier than a text button: this is the tap that turns
                          a browser into a booking, and it competes with a thumb. */}
                      <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {group.slots.map((s) => (
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
                            {showSlotStaff && (
                              <span className="mt-1 w-full truncate text-[11px] font-normal leading-none opacity-65">
                                {staffLabel(s.staffName)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* --- Step 4: add-ons ---------------------------------------------- */}
      {step === 'extras' && service && (
        <section aria-label="Add-ons">
          <div className="mt-1 space-y-2">
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

        </section>
      )}

      {/* --- Step 5: details ---------------------------------------------- */}
      {step === 'details' && service && slot && (
        <section aria-label="Your details">
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
            id={DETAILS_FORM_ID}
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

            {/* The submit control lives in the pinned bar; this stays because
                the reassurance belongs next to the fields, not the button. */}
            <p className="px-1 text-center text-[13px] leading-snug text-[var(--color-muted)]">
              Free changes up to {props.freeCancellationHours} hours before.
            </p>
          </form>
        </section>
      )}

    </div>
    </Screen>
  );
}

/**
 * What this booking currently is, pinned above the tab bar.
 *
 * Rendered through the screen's footer slot rather than as its own fixed bar:
 * a `fixed bottom-0` element sits *under* the tab bar, which is how this spent
 * a while being invisible.
 */
function SummaryBar({
  service, slot, duration, total, addonsTotal, currency, timezone, action,
}: {
  service: DemoService;
  slot: DaySlots['slots'][number] | null;
  duration: number;
  total: number;
  addonsTotal: number;
  currency: string;
  timezone: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight tabular-nums">
          {formatMoney(total, currency)}
          <span className="ml-1.5 font-normal text-[var(--color-muted)]">
            {addonsTotal > 0
              ? `incl. ${formatMoney(addonsTotal, currency)} extras`
              : formatDuration(duration)}
          </span>
        </p>
        <p className="mt-0.5 truncate text-[13px] text-[var(--color-muted)]">
          {slot
            ? `${service.name} · ${formatDayHeading(slot.startsAt.slice(0, 10), timezone)}, ${formatTime(slot.startsAt, timezone)}`
            : service.name}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
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

function Confirmation({
  reference, startsAt, endsAt, staffName, serviceId, serviceName,
  rebookIntervalDays, timezone, visitNoun, rebookCta, businessName,
}: {
  reference: string;
  startsAt: string;
  endsAt: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  rebookIntervalDays: number;
  timezone: string;
  visitNoun: string;
  rebookCta: string;
  businessName: string;
}) {
  const [saved, setSaved] = React.useState(false);

  // The next visit, already dated. Rebooking is decided in the ninety seconds
  // after a visit is booked, not weeks later by campaign — so this screen has
  // to make the offer while the person is still here and still pleased.
  const nextDate = new Date(
    new Date(startsAt).getTime() + rebookIntervalDays * 86_400_000
  )
    .toISOString()
    .slice(0, 10);

  React.useEffect(() => { haptic([10, 60, 18]); }, []);

  return (
    <div className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <div className="flex flex-col items-center text-center">
        <span className="animate-pop-in flex size-[72px] items-center justify-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)]">
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden
            fill="none" stroke="currentColor" strokeWidth={2.4}
            strokeLinecap="round" strokeLinejoin="round">
            <path className="animate-draw" style={{ ['--draw-length' as string]: '22' }}
              d="M4.5 12.5 9.5 17.5 19.5 7" />
          </svg>
        </span>

        <h2 className="animate-rise-in mt-4 text-[27px] font-semibold leading-tight" data-stagger="1">
          You&apos;re booked
        </h2>
        <p className="animate-rise-in mt-1.5 text-[15px] leading-snug text-[var(--color-muted)]" data-stagger="1">
          {formatDayHeading(startsAt.slice(0, 10), timezone)} at{' '}
          <span className="font-medium text-[var(--color-fg)]">
            {formatTime(startsAt, timezone)}
          </span>
          {staffName ? ` with ${staffName}` : ''}
        </p>
      </div>

      <div className="animate-rise-in mt-6 overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]" data-stagger="2">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-[15px] text-[var(--color-muted)]">Confirmation</span>
          <span className="font-mono text-[15px] font-medium tracking-wide tabular-nums">
            {reference}
          </span>
        </div>

        {/* A calendar entry is a reminder the client owns, on top of the ones
            we send — and it is the first thing most people reach for here. */}
        <button
          type="button"
          onClick={() => {
            saveToCalendar({ startsAt, endsAt, serviceName, staffName, businessName, reference });
            haptic();
            setSaved(true);
          }}
          data-press="row"
          className="flex min-h-[var(--tap-min)] w-full items-center gap-3 border-t border-[var(--color-border)] px-4 py-3 text-left transition-colors active:bg-[var(--color-surface-2)]"
        >
          <span className="flex size-7 shrink-0 items-center justify-center text-[var(--color-brand)]">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden
              fill="none" stroke="currentColor" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.2" y="5" width="17.6" height="16" rx="3" />
              <path d="M8 3v4M16 3v4M3.6 10.2h16.8M12 13.5v5M9.5 16h5" />
            </svg>
          </span>
          <span className="flex-1 text-[17px]">
            {saved ? 'Saved to calendar' : 'Add to calendar'}
          </span>
          {saved ? (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden
              className="shrink-0 text-[var(--color-success)]"
              fill="none" stroke="currentColor" strokeWidth={2.6}
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 12.5 9.5 17.5 19.5 7" />
            </svg>
          ) : (
            <Chevron />
          )}
        </button>
      </div>

      <p className="animate-rise-in mt-3 px-1 text-[13px] leading-snug text-[var(--color-muted)]" data-stagger="2">
        We&apos;ve emailed your confirmation and will remind you before your{' '}
        {visitNoun}.
      </p>

      {/* --- The rebooking moment ------------------------------------------ */}
      {rebookIntervalDays > 0 && (
        <div className="animate-rise-in mt-7" data-stagger="3">
          <h3 className="px-1 pb-2 font-[family-name:var(--font-body)] text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">
            While you&apos;re here
          </h3>
          <Link
            href={`/book?service=${serviceId}&date=${nextDate}`}
            data-press
            onClick={() => haptic()}
            className="flex items-center gap-3.5 rounded-[var(--radius-card)] bg-[var(--color-brand)] px-4 py-4 text-[var(--color-brand-fg)] shadow-[var(--shadow-lg)]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-fg)]/15 ring-1 ring-inset ring-[var(--color-brand-fg)]/25">
              <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden
                fill="none" stroke="currentColor" strokeWidth={2.1}
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                <path d="M21 3.5V10h-6.5" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold leading-tight">
                {rebookCta}
              </span>
              <span className="mt-1 block text-[13px] leading-snug opacity-80">
                Most people come back in about {rebookIntervalDays} days. Hold
                that spot now — it takes ten seconds.
              </span>
            </span>
            <span className="shrink-0 opacity-70">
              <Chevron />
            </span>
          </Link>
        </div>
      )}

      <div className="animate-rise-in mt-7 flex flex-col gap-2.5" data-stagger="4">
        <ButtonLink href="/account" variant="secondary" size="lg" fullWidth>
          View my {visitNoun}s
        </ButtonLink>
        <ButtonLink href="/" variant="ghost" fullWidth>
          Back to home
        </ButtonLink>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden
      className="shrink-0 text-current opacity-50"
      fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.2 1.2 6.6 7l-5.4 5.8" />
    </svg>
  );
}

/**
 * Hand the client a calendar entry.
 *
 * Written by hand rather than pulled from a library: it is a dozen lines, and
 * a calendar entry is too useful here to make it wait on a dependency. RFC 5545
 * is fussy — CRLF line endings, escaped text, UTC timestamps — and a malformed
 * file fails silently rather than erroring.
 *
 * A Blob rather than a `data:` URI, and a click rather than an `<a download>`:
 * Safari ignores `download` on iOS and blocks top-level navigation to `data:`
 * URIs, which between them would make this do nothing on the one platform that
 * matters most here.
 */
function saveToCalendar(event: {
  startsAt: string;
  endsAt: string;
  serviceName: string;
  staffName: string;
  businessName: string;
  reference: string;
}): void {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(event.businessName)}-appointment.ics`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick rather than immediately: Safari reads the blob
  // asynchronously and a same-frame revoke races the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function slugify(text: string): string {
  return text.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'appointment';
}

export function buildIcs({
  startsAt, endsAt, serviceName, staffName, businessName, reference,
}: {
  startsAt: string;
  endsAt: string;
  serviceName: string;
  staffName: string;
  businessName: string;
  reference: string;
}): string {
  // Always UTC. A local-offset ISO string ("...T14:00:00-07:00") is not a legal
  // RFC 5545 timestamp, and slots arrive in whatever shape the server sent.
  const stamp = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // Backslash first, or the escapes we add would themselves be escaped.
  const esc = (text: string) =>
    text.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `PRODID:-//${esc(businessName)}//Booking//EN`,
    'BEGIN:VEVENT',
    `UID:${reference}@booking`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(startsAt)}`,
    `DTEND:${stamp(endsAt)}`,
    `SUMMARY:${esc(`${serviceName} — ${businessName}`)}`,
    `DESCRIPTION:${esc(`With ${staffName}. Confirmation ${reference}.`)}`,
    'STATUS:CONFIRMED',
    // A reminder the client controls, an hour out, on top of the ones we send.
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`${serviceName} at ${businessName} in 1 hour`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// --- Helpers ----------------------------------------------------------------

/**
 * Group the menu by category, preserving the order the business set.
 *
 * A single unnamed group when nothing is categorised, so a small business that
 * never filled that field gets one clean list rather than a heading reading
 * "Uncategorised".
 */
export function groupByCategory(
  services: DemoService[]
): Array<{ label: string; services: DemoService[] }> {
  const named = services.filter((s) => s.category);
  if (named.length === 0) return [{ label: '', services }];

  const groups = new Map<string, DemoService[]>();
  for (const service of services) {
    // Anything left uncategorised collects at the end under one heading rather
    // than being dropped from the menu.
    const key = service.category || 'More';
    const bucket = groups.get(key);
    if (bucket) bucket.push(service);
    else groups.set(key, [service]);
  }

  const entries = [...groups.entries()];
  const more = entries.filter(([label]) => label === 'More');
  return [...entries.filter(([label]) => label !== 'More'), ...more]
    .map(([label, s]) => ({ label, services: s }));
}

/** First name only; a slot chip is three characters wide on a small phone. */
function staffLabel(name: string): string {
  return name.split(' ')[0];
}

/**
 * Morning / afternoon / evening.
 *
 * A flat grid of fourteen times is a wall; people do not shop for "2:30", they
 * shop for "some evening this week". Empty parts of the day are dropped rather
 * than shown empty.
 */
export function groupByPartOfDay(
  slots: DaySlots['slots'], timezone: string
): Array<{ label: string; slots: DaySlots['slots'] }> {
  const buckets: Array<{ label: string; until: number; slots: DaySlots['slots'] }> = [
    { label: 'Morning', until: 12, slots: [] },
    { label: 'Afternoon', until: 17, slots: [] },
    { label: 'Evening', until: 24, slots: [] },
  ];

  for (const slot of slots) {
    // The business's hour, not the browser's: a client booking from out of
    // state should still see their 6pm appointment under Evening.
    // `hour12: false` reports midnight as 24 in some engines, so wrap it.
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, hour: 'numeric', hour12: false,
      }).format(new Date(slot.startsAt))
    ) % 24;
    (buckets.find((b) => hour < b.until) ?? buckets[buckets.length - 1]).slots.push(slot);
  }

  return buckets.filter((b) => b.slots.length > 0).map(({ label, slots: s }) => ({ label, slots: s }));
}

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
