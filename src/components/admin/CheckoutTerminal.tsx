'use client';

/**
 * ============================================================================
 * CHECKOUT TERMINAL
 * ============================================================================
 * The register. Ring up the visit, take payment, and — before the client
 * leaves the desk — book the next one.
 *
 * The rebooking step is not an afterthought tacked on the end. It is a full
 * step with a pre-selected date at the client's own interval and their usual
 * provider, because "when would you like to come back?" converts far worse
 * than "I've got you down for the 14th at 2, does that work?"
 * ============================================================================
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, CardBody, CardHeader, Badge, Alert, Divider,
  Field, MoneyInput, Select, EmptyState, Avatar,
} from '@/components/ui';
import { useToast } from '@/components/ui/client';
import { completeCheckout } from '@/app/admin/checkout/actions';
import { cn, formatMoney, formatDuration } from '@/lib/utils';

export interface CheckoutAppointment {
  id: string;
  clientId: string;
  clientName: string;
  clientFirstName: string;
  serviceId: string;
  serviceName: string;
  servicePriceCents: number;
  serviceDurationMin: number;
  rebookIntervalDays: number;
  staffId: string | null;
  staffName: string | null;
  startsAt: string;
  depositCents: number;
  depositPaid: boolean;
  existingAddons: Array<{ id: string; name: string; priceCents: number }>;
  /** The client's own average gap, when they have enough history. */
  avgDaysBetweenVisits: number | null;
  completedVisits: number;
  membership: {
    id: string;
    planName: string;
    creditsBalance: number;
    discountPct: number;
    retailDiscountPct: number;
  } | null;
  hasFutureBooking: boolean;
  loyaltyPoints: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  priceCents: number;
  durationMin?: number;
}

type Step = 'ring' | 'pay' | 'rebook' | 'done';

export function CheckoutTerminal({
  appointment, addons, products, tipPresets, currency, timezone,
  visitNoun, clientNoun,
}: {
  appointment: CheckoutAppointment;
  addons: CatalogItem[];
  products: CatalogItem[];
  tipPresets: number[];
  currency: string;
  timezone: string;
  visitNoun: string;
  clientNoun: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = React.useState<Step>('ring');
  const [lines, setLines] = React.useState<
    Array<{ kind: 'addon' | 'product'; id: string; name: string; priceCents: number; quantity: number }>
  >(
    appointment.existingAddons.map((a) => ({
      kind: 'addon' as const, id: a.id, name: a.name,
      priceCents: a.priceCents, quantity: 1,
    }))
  );
  const [tipPercent, setTipPercent] = React.useState<number | null>(null);
  const [customTip, setCustomTip] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<
    'card' | 'cash' | 'gift_card' | 'membership_credit' | 'package' | 'other'
  >('card');
  const [useCredit, setUseCredit] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    totalCents: number; pointsEarned: number; rebooked: boolean; rebookError?: string;
  } | null>(null);

  // Rebooking state
  const [rebookSlot, setRebookSlot] = React.useState<{
    startsAt: string; staffId: string | null; staffName: string;
  } | null>(null);

  const discountPct = appointment.membership?.discountPct ?? 0;
  const retailDiscountPct = appointment.membership?.retailDiscountPct ?? 0;

  const memberPrice = (cents: number, pct: number) =>
    pct > 0 ? cents - Math.round((cents * pct) / 100) : cents;

  const serviceCents = useCredit
    ? 0
    : memberPrice(appointment.servicePriceCents, discountPct);

  const linesTotal = lines.reduce((sum, line) => {
    const pct = line.kind === 'product' ? retailDiscountPct : discountPct;
    return sum + memberPrice(line.priceCents, pct) * line.quantity;
  }, 0);

  const subtotal = serviceCents + linesTotal;

  const tipCents = React.useMemo(() => {
    if (customTip) return Math.round(Number(customTip) * 100) || 0;
    if (tipPercent == null) return 0;
    // Tip on the service, not on retail — nobody tips on a bottle of shampoo.
    return Math.round((serviceCents * tipPercent) / 100);
  }, [customTip, tipPercent, serviceCents]);

  const depositApplied = appointment.depositPaid ? appointment.depositCents : 0;
  const total = subtotal + tipCents;
  const due = Math.max(total - depositApplied, 0);

  const savedAsMember =
    (appointment.membership ? appointment.servicePriceCents - serviceCents : 0) +
    lines.reduce((sum, line) => {
      const pct = line.kind === 'product' ? retailDiscountPct : discountPct;
      return sum + (line.priceCents - memberPrice(line.priceCents, pct)) * line.quantity;
    }, 0);

  const addLine = (kind: 'addon' | 'product', item: CatalogItem) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === item.id && l.kind === kind);
      if (existing) {
        return prev.map((l) =>
          l.id === item.id && l.kind === kind ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { kind, id: item.id, name: item.name, priceCents: item.priceCents, quantity: 1 }];
    });
  };

  const removeLine = (kind: string, id: string) =>
    setLines((prev) => prev.filter((l) => !(l.id === id && l.kind === kind)));

  async function submit(rebook: typeof rebookSlot) {
    setBusy(true);
    setError(null);

    const response = await completeCheckout({
      appointmentId: appointment.id,
      lines: lines.map((l) => ({ kind: l.kind, id: l.id, quantity: l.quantity })),
      tipCents,
      discountCents: 0,
      paymentMethod,
      useMembershipCredit: useCredit,
      rebook: rebook
        ? {
            startsAt: rebook.startsAt,
            staffId: rebook.staffId,
            serviceId: appointment.serviceId,
          }
        : null,
    });

    setBusy(false);

    if (!response.ok) {
      setError(response.error);
      return;
    }

    setResult(response.data!);
    setStep('done');
    toast(response.message ?? 'Done.');
    router.refresh();
  }

  // --- Done ----------------------------------------------------------------

  if (step === 'done' && result) {
    return (
      <Card>
        <CardBody className="p-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-2xl text-[var(--color-success)]">
            ✓
          </div>
          <h2 className="mt-4 text-2xl font-semibold">
            {formatMoney(result.totalCents, currency)} collected
          </h2>
          <p className="mt-1 text-[var(--color-muted)]">
            {appointment.clientFirstName} is checked out.
          </p>

          {result.rebooked ? (
            <Alert tone="success" className="mt-5 text-left">
              <strong>Next {visitNoun} booked.</strong> That is the single most
              valuable thing that happens at this desk — a {clientNoun} who
              leaves with a date is worth several times one who does not.
            </Alert>
          ) : (
            <Alert tone="warning" className="mt-5 text-left">
              {result.rebookError ?? (
                <>
                  No next {visitNoun} booked. They will get a nudge when they are
                  due, but that converts far worse than booking at the desk.
                </>
              )}
            </Alert>
          )}

          {result.pointsEarned > 0 && (
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              {result.pointsEarned} loyalty points earned
              {result.rebooked && ' (including the rebooking bonus)'}.
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => router.push('/admin/checkout')}>
              Next {clientNoun}
            </Button>
            <Button variant="secondary" onClick={() => router.push('/admin/calendar')}>
              Back to calendar
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {/* --- Step: ring up ---------------------------------------------- */}
        {step === 'ring' && (
          <>
            <Card>
              <CardHeader
                title="Add to the ticket"
                description="Add-ons and retail are where average ticket actually moves."
              />
              <CardBody>
                {addons.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                      Add-ons
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {addons.map((addon) => (
                        <button
                          key={addon.id}
                          onClick={() => addLine('addon', addon)}
                          className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--color-brand)]"
                        >
                          <span className="block font-medium">{addon.name}</span>
                          <span className="text-xs text-[var(--color-muted)]">
                            {formatMoney(addon.priceCents, currency)}
                            {addon.durationMin ? ` · +${addon.durationMin}m` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {products.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                      Retail
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {products.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => addLine('product', product)}
                          className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--color-brand)]"
                        >
                          <span className="block font-medium">{product.name}</span>
                          <span className="text-xs text-[var(--color-muted)]">
                            {formatMoney(product.priceCents, currency)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {addons.length === 0 && products.length === 0 && (
                  <EmptyState
                    title="Nothing to add"
                    description="Set up add-ons and retail in Services to lift average ticket."
                  />
                )}
              </CardBody>
            </Card>

            {appointment.membership && appointment.membership.creditsBalance > 0 && (
              <Card>
                <CardBody className="p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={useCredit}
                      onChange={(e) => setUseCredit(e.target.checked)}
                    />
                    <span>
                      <span className="block font-medium">
                        Use a membership credit for this {visitNoun}
                      </span>
                      <span className="block text-sm text-[var(--color-muted)]">
                        {appointment.membership.creditsBalance} available on{' '}
                        {appointment.membership.planName}. Unused credits are the
                        commonest reason a member cancels.
                      </span>
                    </span>
                  </label>
                </CardBody>
              </Card>
            )}

            <div className="flex justify-end">
              <Button size="lg" onClick={() => setStep('pay')}>
                Continue to payment
              </Button>
            </div>
          </>
        )}

        {/* --- Step: payment ---------------------------------------------- */}
        {step === 'pay' && (
          <>
            <Card>
              <CardHeader title="Tip" description="Anchoring the default high measurably raises the average." />
              <CardBody>
                <div className="flex flex-wrap gap-2">
                  {tipPresets.map((percent) => (
                    <button
                      key={percent}
                      onClick={() => { setTipPercent(percent); setCustomTip(''); }}
                      className={cn(
                        'min-w-20 rounded-[var(--radius-card)] border px-4 py-3 text-center transition-colors',
                        tipPercent === percent && !customTip
                          ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                          : 'border-[var(--color-border)]'
                      )}
                    >
                      <span className="block font-semibold">{percent}%</span>
                      <span className="text-xs text-[var(--color-muted)]">
                        {formatMoney(Math.round((serviceCents * percent) / 100), currency)}
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => { setTipPercent(null); setCustomTip(''); }}
                    className={cn(
                      'min-w-20 rounded-[var(--radius-card)] border px-4 py-3 text-center transition-colors',
                      tipPercent === null && !customTip
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                        : 'border-[var(--color-border)]'
                    )}
                  >
                    <span className="block font-semibold">None</span>
                  </button>
                </div>

                <Field label="Or enter an amount">
                  <MoneyInput
                    value={customTip}
                    onChange={(e) => { setCustomTip(e.target.value); setTipPercent(null); }}
                    placeholder="0.00"
                  />
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Payment method" />
              <CardBody>
                <Select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                >
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                  <option value="gift_card">Gift card</option>
                  <option value="package">Prepaid package</option>
                  <option value="other">Other</option>
                </Select>

                <Alert tone="neutral">
                  This records the sale. Card processing runs through your own
                  terminal or Stripe — the template does not assume which.
                </Alert>
              </CardBody>
            </Card>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('ring')}>Back</Button>
              <Button size="lg" onClick={() => setStep('rebook')}>
                Take {formatMoney(due, currency)}
              </Button>
            </div>
          </>
        )}

        {/* --- Step: rebook ----------------------------------------------- */}
        {step === 'rebook' && (
          <RebookStep
            appointment={appointment}
            timezone={timezone}
            visitNoun={visitNoun}
            clientNoun={clientNoun}
            busy={busy}
            selected={rebookSlot}
            onSelect={setRebookSlot}
            onSkip={() => submit(null)}
            onConfirm={() => submit(rebookSlot)}
            onBack={() => setStep('pay')}
          />
        )}
      </div>

      {/* --- Ticket ------------------------------------------------------- */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader
            title={appointment.clientName}
            description={`${appointment.serviceName} · ${formatDuration(appointment.serviceDurationMin)}`}
          />
          <CardBody className="space-y-2 text-sm">
            {appointment.membership && (
              <Badge tone="brand">{appointment.membership.planName}</Badge>
            )}

            <div className="space-y-1.5">
              <TicketLine
                label={appointment.serviceName}
                value={useCredit ? 'Credit' : formatMoney(serviceCents, currency)}
                struck={useCredit}
              />

              {lines.map((line) => {
                const pct = line.kind === 'product' ? retailDiscountPct : discountPct;
                return (
                  <TicketLine
                    key={`${line.kind}-${line.id}`}
                    label={`${line.name}${line.quantity > 1 ? ` ×${line.quantity}` : ''}`}
                    value={formatMoney(memberPrice(line.priceCents, pct) * line.quantity, currency)}
                    onRemove={() => removeLine(line.kind, line.id)}
                  />
                );
              })}
            </div>

            <Divider />

            <TicketLine label="Subtotal" value={formatMoney(subtotal, currency)} />
            {tipCents > 0 && <TicketLine label="Tip" value={formatMoney(tipCents, currency)} />}
            {depositApplied > 0 && (
              <TicketLine
                label="Deposit paid"
                value={`−${formatMoney(depositApplied, currency)}`}
              />
            )}

            <Divider />

            <div className="flex items-baseline justify-between">
              <span className="font-semibold">Due</span>
              <span className="text-2xl font-bold tabular-nums">
                {formatMoney(due, currency)}
              </span>
            </div>

            {savedAsMember > 0 && (
              <p className="text-xs text-[var(--color-success)]">
                Saved {formatMoney(savedAsMember, currency)} as a member
              </p>
            )}

            {appointment.hasFutureBooking && (
              <Alert tone="success" className="mt-2">
                Already has a future {visitNoun} booked.
              </Alert>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function TicketLine({
  label, value, struck, onRemove,
}: {
  label: string;
  value: string;
  struck?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={cn('min-w-0 truncate', struck && 'line-through opacity-60')}>
        {label}
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="ml-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
          >
            ×
          </button>
        )}
      </span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The rebooking prompt.
 *
 * Loads real availability around the client's ideal return date and leads with
 * a single suggestion rather than a calendar. Skipping is possible but
 * deliberately not the prominent option.
 */
function RebookStep({
  appointment, timezone, visitNoun, clientNoun, busy, selected,
  onSelect, onSkip, onConfirm, onBack,
}: {
  appointment: CheckoutAppointment;
  timezone: string;
  visitNoun: string;
  clientNoun: string;
  busy: boolean;
  selected: { startsAt: string; staffId: string | null; staffName: string } | null;
  onSelect: (slot: { startsAt: string; staffId: string | null; staffName: string } | null) => void;
  onSkip: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const [days, setDays] = React.useState<
    Array<{ date: string; slots: Array<{ startsAt: string; staffId: string; staffName: string }> }>
  >([]);
  const [loading, setLoading] = React.useState(true);

  // The client's own cadence beats the catalog default once they have history.
  const intervalDays =
    appointment.completedVisits >= 2 && appointment.avgDaysBetweenVisits
      ? Math.round(appointment.avgDaysBetweenVisits)
      : appointment.rebookIntervalDays;

  const idealDate = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + intervalDays);
    return d;
  }, [intervalDays]);

  React.useEffect(() => {
    // Search a window around the ideal date rather than "next available" —
    // the point is to land them on their own rhythm.
    const from = new Date(idealDate);
    from.setDate(from.getDate() - 5);
    if (from < new Date()) from.setTime(Date.now());

    const params = new URLSearchParams({
      serviceId: appointment.serviceId,
      fromDate: from.toISOString().slice(0, 10),
      days: '14',
      ...(appointment.staffId ? { staffId: appointment.staffId } : {}),
    });

    fetch(`/api/availability?${params}`)
      .then((r) => r.json())
      .then((data) => setDays(data.days ?? []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, [appointment.serviceId, appointment.staffId, idealDate]);

  // One suggestion, chosen for closeness to the ideal date.
  const suggestion = React.useMemo(() => {
    const all = days.flatMap((d) => d.slots);
    if (!all.length) return null;
    const target = idealDate.getTime();
    return all.reduce((best, slot) =>
      Math.abs(new Date(slot.startsAt).getTime() - target) <
      Math.abs(new Date(best.startsAt).getTime() - target)
        ? slot
        : best
    );
  }, [days, idealDate]);

  React.useEffect(() => {
    if (suggestion && !selected) onSelect(suggestion);
  }, [suggestion, selected, onSelect]);

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'long', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));

  return (
    <Card>
      <CardHeader
        title={`Book ${appointment.clientFirstName}'s next ${visitNoun}`}
        description={
          appointment.completedVisits >= 2 && appointment.avgDaysBetweenVisits
            ? `They come back about every ${intervalDays} days.`
            : `Most ${clientNoun}s come back in about ${intervalDays} days.`
        }
      />
      <CardBody>
        {appointment.hasFutureBooking ? (
          <Alert tone="success">
            They already have a future {visitNoun} on the books. Nothing to do here.
          </Alert>
        ) : loading ? (
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">
            Finding times…
          </p>
        ) : !suggestion ? (
          <Alert tone="warning">
            No open times in the next two weeks around their usual interval.
            Book from the calendar instead.
          </Alert>
        ) : (
          <>
            {/* The suggestion, stated as a proposal rather than a question */}
            <button
              onClick={() => onSelect(suggestion)}
              className={cn(
                'flex w-full items-center gap-3 rounded-[var(--radius-card)] border-2 p-4 text-left transition-colors',
                selected?.startsAt === suggestion.startsAt
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                  : 'border-[var(--color-border)]'
              )}
            >
              <Avatar name={suggestion.staffName} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{fmt(suggestion.startsAt)}</span>
                <span className="block text-sm text-[var(--color-muted)]">
                  with {suggestion.staffName}
                </span>
              </span>
              {selected?.startsAt === suggestion.startsAt && (
                <Badge tone="brand">Selected</Badge>
              )}
            </button>

            <Divider label="Other times" />

            <div className="max-h-64 space-y-3 overflow-y-auto">
              {days
                .filter((d) => d.slots.length > 0)
                .slice(0, 8)
                .map((day) => (
                  <div key={day.date}>
                    <p className="text-xs font-medium text-[var(--color-muted)]">
                      {new Intl.DateTimeFormat('en-US', {
                        timeZone: timezone, weekday: 'long', month: 'short', day: 'numeric',
                      }).format(new Date(`${day.date}T12:00:00Z`))}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {dedupe(day.slots).slice(0, 10).map((slot) => (
                        <button
                          key={slot.startsAt}
                          onClick={() => onSelect(slot)}
                          className={cn(
                            'rounded-[var(--radius-card)] border px-2.5 py-1.5 text-sm tabular-nums transition-colors',
                            selected?.startsAt === slot.startsAt
                              ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                              : 'border-[var(--color-border)] hover:border-[var(--color-brand)]'
                          )}
                        >
                          {new Intl.DateTimeFormat('en-US', {
                            timeZone: timezone, hour: 'numeric', minute: '2-digit',
                          }).format(new Date(slot.startsAt))}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button variant="ghost" onClick={onBack} disabled={busy}>Back</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onSkip} loading={busy}>
              Skip
            </Button>
            <Button
              size="lg"
              loading={busy}
              disabled={!selected || appointment.hasFutureBooking}
              onClick={appointment.hasFutureBooking ? onSkip : onConfirm}
            >
              {appointment.hasFutureBooking
                ? 'Finish checkout'
                : selected
                  ? 'Book it and finish'
                  : 'Finish checkout'}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function dedupe<T extends { startsAt: string }>(slots: T[]): T[] {
  const seen = new Map<string, T>();
  for (const slot of slots) if (!seen.has(slot.startsAt)) seen.set(slot.startsAt, slot);
  return [...seen.values()];
}
