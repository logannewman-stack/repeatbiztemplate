'use client';

/**
 * ============================================================================
 * POLICY EDITOR
 * ============================================================================
 * Writes to `businesses.policy`, which is deep-merged over the compiled
 * defaults in `src/config/rules.ts` at read time. That means an owner can
 * shorten their cancellation window at 9pm on a Friday without waiting for a
 * deploy, and a fork still ships with sensible values on day one.
 *
 * Each control states what it costs as well as what it protects. A deposit
 * threshold set too low quietly kills conversion, and nobody discovers that
 * from a number in a form.
 * ============================================================================
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, CardBody, CardHeader, Field, Input, Toggle, Alert, Badge, Divider,
} from '@/components/ui';
import { useToast } from '@/components/ui/client';
import { savePolicy } from '@/app/admin/actions';
import { formatMoney } from '@/lib/utils';

export interface PolicyValues {
  freeCancellationHours: number;
  feeTiers: Array<{ withinHours: number; feePercent: number; label: string }>;
  noShowFeePercent: number;
  rescheduleFirst: boolean;
  freeReschedulesPerAppointment: number;
  prepayAfterNoShows: number;
  requireCardAfterLateCancels: number;
  depositsEnabled: boolean;
  depositPercent: number;
  depositAboveCents: number;
  depositAboveMinutes: number;
  depositNewClients: boolean;
  depositWaiveMembers: boolean;
  reminderHours: number[];
  quietStart: string;
  quietEnd: string;
  nudgeDayOffsets: number[];
  lapseMultiplier: number;
  giveUpAfterDays: number;
  minLeadTimeMinutes: number;
  maxAdvanceBookingDays: number;
  slotIntervalMinutes: number;
  allowProcessingTimeOverlap: boolean;
  allowPause: boolean;
  maxPauseMonths: number;
  creditRolloverPeriods: number;
  publicReviewUrl: string;
}

export function PolicyEditor({
  initial, currency, visitNoun, clientNoun, readOnly,
}: {
  initial: PolicyValues;
  currency: string;
  visitNoun: string;
  clientNoun: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = <K extends keyof PolicyValues>(key: K, value: PolicyValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const placeholderReviewUrl = form.publicReviewUrl.includes('example.test');

  async function save() {
    setBusy(true);
    setError(null);
    const result = await savePolicy(form);
    setBusy(false);

    if (result.ok) {
      toast(result.message ?? 'Policies saved.');
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {placeholderReviewUrl && (
        <Alert tone="warning" title="Review link is still a placeholder">
          Happy {clientNoun}s are being sent to a domain that does not exist. Set
          it to the real Google or Yelp listing below.
        </Alert>
      )}

      {/* --- Cancellations ------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Cancellations"
          description="Every cancelled slot is pure loss — the rent and the hour are already spent."
        />
        <CardBody>
          <Field
            label="Free cancellation window (hours)"
            hint="24 is standard. 48 for high-value work where refilling takes longer."
          >
            <Input
              type="number" min={0} max={168} disabled={readOnly}
              value={form.freeCancellationHours}
              onChange={(e) => set('freeCancellationHours', Number(e.target.value))}
            />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium">Late cancellation fees</p>
            {form.feeTiers.map((tier, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--color-muted)]">Under</span>
                <Input
                  type="number" min={1} max={168} disabled={readOnly}
                  value={tier.withinHours}
                  onChange={(e) => {
                    const next = [...form.feeTiers];
                    next[index] = { ...tier, withinHours: Number(e.target.value) };
                    set('feeTiers', next);
                  }}
                  className="w-20"
                />
                <span className="text-sm text-[var(--color-muted)]">hours →</span>
                <Input
                  type="number" min={0} max={100} disabled={readOnly}
                  value={tier.feePercent}
                  onChange={(e) => {
                    const next = [...form.feeTiers];
                    next[index] = { ...tier, feePercent: Number(e.target.value) };
                    set('feeTiers', next);
                  }}
                  className="w-20"
                />
                <span className="text-sm text-[var(--color-muted)]">%</span>
                {!readOnly && form.feeTiers.length > 1 && (
                  <Button
                    size="xs" variant="ghost"
                    onClick={() => set('feeTiers', form.feeTiers.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {!readOnly && (
              <Button
                size="xs" variant="ghost"
                onClick={() =>
                  set('feeTiers', [
                    ...form.feeTiers,
                    { withinHours: 24, feePercent: 25, label: 'Late cancellation' },
                  ])
                }
              >
                + Add a tier
              </Button>
            )}
            <p className="text-xs text-[var(--color-muted)]">
              Tiers are matched shortest-notice first. A paid deposit is applied
              against the fee rather than charged on top.
            </p>
          </div>

          <Field label="No-show fee (% of service)">
            <Input
              type="number" min={0} max={100} disabled={readOnly}
              value={form.noShowFeePercent}
              onChange={(e) => set('noShowFeePercent', Number(e.target.value))}
            />
          </Field>

          <Divider />

          <Toggle
            checked={form.rescheduleFirst}
            onChange={(v) => set('rescheduleFirst', v)}
            disabled={readOnly}
            label="Offer rescheduling before cancelling"
            description="Leave this on. A moved appointment keeps the revenue; a cancelled one usually does not."
          />

          <Field
            label="Free reschedules per appointment"
            hint="After this, moving it costs the same as a late cancellation."
          >
            <Input
              type="number" min={0} max={5} disabled={readOnly}
              value={form.freeReschedulesPerAppointment}
              onChange={(e) => set('freeReschedulesPerAppointment', Number(e.target.value))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Card required after N late cancels"
              hint="0 to never require one."
            >
              <Input
                type="number" min={0} max={10} disabled={readOnly}
                value={form.requireCardAfterLateCancels}
                onChange={(e) => set('requireCardAfterLateCancels', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Full prepay after N no-shows"
              hint="Prepayment stays refundable with notice."
            >
              <Input
                type="number" min={0} max={10} disabled={readOnly}
                value={form.prepayAfterNoShows}
                onChange={(e) => set('prepayAfterNoShows', Number(e.target.value))}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* --- Deposits ----------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Deposits"
          description="The single most effective anti-no-show mechanism — and the easiest one to set too aggressively."
        />
        <CardBody>
          <Toggle
            checked={form.depositsEnabled}
            onChange={(v) => set('depositsEnabled', v)}
            disabled={readOnly}
            label="Take deposits"
          />

          {form.depositsEnabled && (
            <>
              <Field label="Default deposit (% of price)">
                <Input
                  type="number" min={1} max={100} disabled={readOnly}
                  value={form.depositPercent}
                  onChange={(e) => set('depositPercent', Number(e.target.value))}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Require above"
                  hint="Below this, a deposit costs more conversion than it saves."
                >
                  <Input
                    type="number" min={0} step={5} disabled={readOnly}
                    value={form.depositAboveCents / 100}
                    onChange={(e) => set('depositAboveCents', Math.round(Number(e.target.value) * 100))}
                  />
                </Field>
                <Field label="Or longer than (minutes)">
                  <Input
                    type="number" min={0} max={480} step={15} disabled={readOnly}
                    value={form.depositAboveMinutes}
                    onChange={(e) => set('depositAboveMinutes', Number(e.target.value))}
                  />
                </Field>
              </div>

              <p className="text-xs text-[var(--color-muted)]">
                Currently: {formatMoney(form.depositAboveCents, currency)} or{' '}
                {form.depositAboveMinutes} minutes triggers a{' '}
                {form.depositPercent}% deposit.
              </p>

              <Toggle
                checked={form.depositNewClients}
                onChange={(v) => set('depositNewClients', v)}
                disabled={readOnly}
                label={`Require from new ${clientNoun}s`}
                description="First-time bookers no-show more than regulars."
              />

              <Toggle
                checked={form.depositWaiveMembers}
                onChange={(v) => set('depositWaiveMembers', v)}
                disabled={readOnly}
                label="Waive for members"
                description="Leave this on. It is a benefit members actually feel."
              />
            </>
          )}
        </CardBody>
      </Card>

      {/* --- Booking window ------------------------------------------------ */}
      <Card>
        <CardHeader title="Booking window" />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum notice (min)" hint="0 lets people book the next open slot.">
              <Input
                type="number" min={0} max={1440} step={15} disabled={readOnly}
                value={form.minLeadTimeMinutes}
                onChange={(e) => set('minLeadTimeMinutes', Number(e.target.value))}
              />
            </Field>
            <Field label="Book up to (days ahead)" hint="Longer books more revenue in advance.">
              <Input
                type="number" min={1} max={730} disabled={readOnly}
                value={form.maxAdvanceBookingDays}
                onChange={(e) => set('maxAdvanceBookingDays', Number(e.target.value))}
              />
            </Field>
            <Field label="Slot grid (min)" hint="15 packs the book; 30 reads more cleanly.">
              <Input
                type="number" min={5} max={60} step={5} disabled={readOnly}
                value={form.slotIntervalMinutes}
                onChange={(e) => set('slotIntervalMinutes', Number(e.target.value))}
              />
            </Field>
          </div>

          <Toggle
            checked={form.allowProcessingTimeOverlap}
            onChange={(v) => set('allowProcessingTimeOverlap', v)}
            disabled={readOnly}
            label="Book into processing gaps"
            description="Lets a short service run inside a long one's develop-and-wait window. The largest capacity gain available to most salons."
          />
        </CardBody>
      </Card>

      {/* --- Reminders and retention --------------------------------------- */}
      <Card>
        <CardHeader
          title="Reminders and rebooking"
          description="Confirmed appointments no-show far less. Nudges recover the ones who drift."
        />
        <CardBody>
          <Field
            label="Reminder hours before"
            hint="Comma-separated. 72, 24, 3 is a reasonable default."
          >
            <Input
              disabled={readOnly}
              value={form.reminderHours.join(', ')}
              onChange={(e) =>
                set(
                  'reminderHours',
                  e.target.value.split(',').map((v) => Number(v.trim())).filter((n) => n > 0)
                )
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quiet hours start">
              <Input
                type="time" disabled={readOnly}
                value={form.quietStart}
                onChange={(e) => set('quietStart', e.target.value)}
              />
            </Field>
            <Field label="Quiet hours end">
              <Input
                type="time" disabled={readOnly}
                value={form.quietEnd}
                onChange={(e) => set('quietEnd', e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Marketing sends inside quiet hours are deferred to the morning, not
            dropped. Reminders and confirmations always go out.
          </p>

          <Divider />

          <Field
            label="Rebooking nudges (days past due)"
            hint="Comma-separated. More than three touches starts to annoy people."
          >
            <Input
              disabled={readOnly}
              value={form.nudgeDayOffsets.join(', ')}
              onChange={(e) =>
                set(
                  'nudgeDayOffsets',
                  e.target.value.split(',').map((v) => Number(v.trim())).filter((n) => n >= 0)
                )
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Lapsed after"
              hint={`Multiple of a ${clientNoun}'s own visit interval.`}
            >
              <Input
                type="number" min={1} max={6} step={0.1} disabled={readOnly}
                value={form.lapseMultiplier}
                onChange={(e) => set('lapseMultiplier', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Stop chasing after (days)"
              hint="Past this, chasing costs more than it returns."
            >
              <Input
                type="number" min={30} max={1095} disabled={readOnly}
                value={form.giveUpAfterDays}
                onChange={(e) => set('giveUpAfterDays', Number(e.target.value))}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* --- Memberships --------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Memberships"
          description="Pausing is the single best churn saver you have."
        />
        <CardBody>
          <Toggle
            checked={form.allowPause}
            onChange={(v) => set('allowPause', v)}
            disabled={readOnly}
            label="Let members pause instead of cancel"
            description="A paused member keeps their rate and credits, and comes back with one click."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Maximum pause (months)">
              <Input
                type="number" min={1} max={12} disabled={readOnly || !form.allowPause}
                value={form.maxPauseMonths}
                onChange={(e) => set('maxPauseMonths', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Credit rollover (months)"
              hint="0 is use-it-or-lose-it."
            >
              <Input
                type="number" min={0} max={12} disabled={readOnly}
                value={form.creditRolloverPeriods}
                onChange={(e) => set('creditRolloverPeriods', Number(e.target.value))}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* --- Reviews ------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Reviews"
          description="Happy clients go public; unhappy ones reach the owner privately."
        />
        <CardBody>
          <Field
            label="Public review link"
            hint="Where a 4- or 5-star rating sends people. Use the real Google or Yelp listing."
            error={placeholderReviewUrl ? 'Still pointing at a placeholder domain.' : null}
          >
            <Input
              type="url" disabled={readOnly}
              value={form.publicReviewUrl}
              onChange={(e) => set('publicReviewUrl', e.target.value)}
              placeholder="https://g.page/r/..."
            />
          </Field>
        </CardBody>
      </Card>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] py-3">
        <p className="text-xs text-[var(--color-muted)]">
          The public policies page updates the moment you save.
        </p>
        <Button loading={busy} disabled={readOnly} onClick={save}>
          Save policies
        </Button>
      </div>
    </div>
  );
}
