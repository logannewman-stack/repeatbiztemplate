'use client';

/**
 * ============================================================================
 * MEMBERSHIP MANAGER
 * ============================================================================
 * The client-facing membership screen, and the save flow that runs when they
 * try to leave.
 *
 * The save flow is not a dark pattern: cancelling is always reachable in one
 * click from every screen here, and the offers are real. But a member who is
 * leaving because they are travelling for two months should be offered a
 * pause, not lost — and nobody thinks to ask for that unless it is shown.
 *
 * Offers already declined are filtered out server-side, so nobody gets pitched
 * the same thing twice.
 * ============================================================================
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, CardBody, CardHeader, Badge, Alert, Divider, Field, Select, Textarea,
} from '@/components/ui';
import { cn, formatMoney } from '@/lib/utils';

interface Membership {
  id: string;
  status: string;
  creditsBalance: number;
  creditsUsedThisPeriod: number;
  includedCredits: number;
  currentPeriodEnd: string | null;
  pausedUntil: string | null;
  cancelAtPeriodEnd: boolean;
  planName: string;
  priceCents: number;
  interval: string;
  rolloverPeriods: number;
}

interface SaveOffer {
  kind: string;
  label: string;
  description: string;
  value?: number;
}

type Mode = 'overview' | 'save' | 'confirm-cancel' | 'done';

export function MembershipManager({
  membership, saveOffers, otherPlans, currency, visitNoun, maxPauseMonths,
}: {
  membership: Membership;
  saveOffers: SaveOffer[];
  otherPlans: Array<{
    id: string; name: string; priceCents: number; interval: string; includedCredits: number;
  }>;
  currency: string;
  visitNoun: string;
  maxPauseMonths: number;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>('overview');
  const [offerIndex, setOfferIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [downgradeTo, setDowngradeTo] = React.useState(otherPlans[0]?.id ?? '');

  async function call(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/membership/${membership.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      return data as { message?: string };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function acceptOffer(offer: SaveOffer) {
    const result =
      offer.kind === 'pause'
        ? await call('pause', { months: Math.min(offer.value ?? 3, maxPauseMonths) })
        : offer.kind === 'downgrade'
          ? await call('change-plan', { planId: downgradeTo })
          : await call('save-offer', { kind: offer.kind, value: offer.value });

    if (result) {
      setOutcome(result.message ?? 'Done — your membership stays active.');
      setMode('done');
      router.refresh();
    }
  }

  // --- Done ----------------------------------------------------------------

  if (mode === 'done' && outcome) {
    return (
      <Card>
        <CardBody className="p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-xl text-[var(--color-success)]">
            ✓
          </div>
          <p className="mt-3 font-medium">{outcome}</p>
          <Button className="mt-5" onClick={() => { setMode('overview'); setOutcome(null); }}>
            Back to my membership
          </Button>
        </CardBody>
      </Card>
    );
  }

  // --- Save flow -----------------------------------------------------------

  if (mode === 'save') {
    const offer = saveOffers[offerIndex];

    if (!offer) {
      // Nothing left to offer — go straight to confirmation rather than
      // inventing another hurdle.
      setMode('confirm-cancel');
      return null;
    }

    return (
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Card>
          <CardHeader
            title="Before you go"
            description={
              offerIndex === 0
                ? 'One thing that might suit you better than cancelling.'
                : 'Or this, if that did not fit.'
            }
          />
          <CardBody>
            <div className="rounded-[var(--radius-card)] border-2 border-[var(--color-brand)] bg-[var(--color-brand-soft)] p-4">
              <p className="font-semibold">{offer.label}</p>
              <p className="mt-1 text-sm">{offer.description}</p>
            </div>

            {offer.kind === 'downgrade' && otherPlans.length > 0 && (
              <Field label="Switch to">
                <Select value={downgradeTo} onChange={(e) => setDowngradeTo(e.target.value)}>
                  {otherPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {formatMoney(plan.priceCents, currency)}/{plan.interval}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <div className="space-y-2">
              <Button
                fullWidth size="lg" loading={busy}
                onClick={() => acceptOffer(offer)}
              >
                {offer.kind === 'pause' ? 'Pause my membership' : 'Yes, do that'}
              </Button>

              <button
                onClick={() =>
                  offerIndex + 1 < saveOffers.length
                    ? setOfferIndex(offerIndex + 1)
                    : setMode('confirm-cancel')
                }
                disabled={busy}
                className="w-full py-2 text-center text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
              >
                No thanks — continue cancelling
              </button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // --- Confirm cancel ------------------------------------------------------

  if (mode === 'confirm-cancel') {
    return (
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Card>
          <CardHeader
            title="Cancel your membership"
            description={
              membership.currentPeriodEnd
                ? `You keep your benefits until ${new Date(membership.currentPeriodEnd).toLocaleDateString()}.`
                : undefined
            }
          />
          <CardBody>
            {membership.creditsBalance > 0 && (
              <Alert tone="warning" title={`You have ${membership.creditsBalance} unused credits`}>
                Book them before your membership ends — they do not carry over
                once it does.
              </Alert>
            )}

            <Field label="Why are you cancelling?" hint="Optional, and it goes to the owner.">
              <Textarea
                rows={3} value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional"
              />
            </Field>

            <div className="space-y-2">
              <Button
                fullWidth variant="danger" loading={busy}
                onClick={async () => {
                  const result = await call('cancel', { reason });
                  if (result) {
                    setOutcome(
                      membership.currentPeriodEnd
                        ? `Cancelled. Your benefits run until ${new Date(membership.currentPeriodEnd).toLocaleDateString()}.`
                        : 'Your membership has been cancelled.'
                    );
                    setMode('done');
                    router.refresh();
                  }
                }}
              >
                Cancel my membership
              </Button>
              <button
                onClick={() => { setMode('overview'); setOfferIndex(0); }}
                className="w-full py-2 text-center text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
              >
                Keep my membership
              </button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // --- Overview ------------------------------------------------------------

  const creditProgress =
    membership.includedCredits > 0
      ? Math.min(membership.creditsUsedThisPeriod / membership.includedCredits, 1)
      : 0;

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {membership.status === 'past_due' && (
        <Alert tone="danger" title="We couldn't process your payment">
          Your benefits stay active for a few more days. Update your card to keep
          them.
        </Alert>
      )}

      {membership.status === 'paused' && membership.pausedUntil && (
        <Alert tone="warning" title="Paused">
          Billing resumes {new Date(membership.pausedUntil).toLocaleDateString()}.
          Your rate and banked credits are held until then.
        </Alert>
      )}

      {membership.cancelAtPeriodEnd && membership.currentPeriodEnd && (
        <Alert tone="warning" title="Cancelling">
          Your membership ends{' '}
          {new Date(membership.currentPeriodEnd).toLocaleDateString()}. You keep
          full benefits until then.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Your credits"
          action={
            <span className="text-2xl font-bold tabular-nums">
              {membership.creditsBalance}
            </span>
          }
        />
        <CardBody>
          {membership.includedCredits > 0 && (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--color-brand)] transition-all"
                  style={{ width: `${creditProgress * 100}%` }}
                />
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                {membership.creditsUsedThisPeriod} of {membership.includedCredits}{' '}
                included {visitNoun}s used this period.
              </p>
            </>
          )}

          {membership.creditsBalance > 0 ? (
            <Alert tone="brand">
              You have {membership.creditsBalance} included{' '}
              {membership.creditsBalance === 1 ? visitNoun : `${visitNoun}s`} waiting.
              {membership.rolloverPeriods > 0
                ? ` They roll over for ${membership.rolloverPeriods} months, but the times you want go first.`
                : ' Use them before the period ends.'}
            </Alert>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">
              Your next credits arrive when your membership renews.
            </p>
          )}

          <a href="/book">
            <Button fullWidth>Book a {visitNoun}</Button>
          </a>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Manage" />
        <CardBody className="space-y-2">
          {membership.status === 'paused' ? (
            <Button
              fullWidth variant="secondary" loading={busy}
              onClick={async () => {
                const result = await call('resume');
                if (result) {
                  setOutcome('Your membership is active again.');
                  setMode('done');
                  router.refresh();
                }
              }}
            >
              Resume my membership
            </Button>
          ) : (
            <a href="/api/membership/portal">
              <Button fullWidth variant="secondary">
                Update payment method
              </Button>
            </a>
          )}

          {!membership.cancelAtPeriodEnd && membership.status !== 'paused' && (
            <button
              onClick={() => setMode(saveOffers.length > 0 ? 'save' : 'confirm-cancel')}
              className="w-full py-2 text-center text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
            >
              Cancel my membership
            </button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
