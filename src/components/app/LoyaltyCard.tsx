/**
 * ============================================================================
 * LOYALTY CARD
 * ============================================================================
 * The reason to open the app when there is nothing to book.
 *
 * A tier badge on its own is decoration. What changes behaviour is the gap —
 * "$415 more this year and priority booking is yours" — because it turns the
 * next visit from a chore into progress against something already half done.
 * People finish what they have started; that is the whole mechanic.
 *
 * Silent when there is no next tier to reach for. Someone already at the top
 * does not need a progress bar telling them so.
 * ============================================================================
 */

import { formatMoney } from '@/lib/utils';

export interface LoyaltyTier {
  name: string;
  minAnnualSpendCents: number;
  perks: string[];
}

export function tierFor(
  annualSpendCents: number, tiers: LoyaltyTier[]
): { current: LoyaltyTier; next: LoyaltyTier | null } | null {
  if (tiers.length === 0) return null;

  // Sorted defensively: config is hand-edited per client and the order there
  // is not guaranteed.
  const ordered = [...tiers].sort((a, b) => a.minAnnualSpendCents - b.minAnnualSpendCents);
  let current = ordered[0];
  for (const tier of ordered) {
    if (annualSpendCents >= tier.minAnnualSpendCents) current = tier;
  }
  const next = ordered.find((t) => t.minAnnualSpendCents > annualSpendCents) ?? null;
  return { current, next };
}

export function LoyaltyCard({
  points, annualSpendCents, tiers, pointsName, currency = 'USD',
}: {
  points: number;
  annualSpendCents: number;
  tiers: LoyaltyTier[];
  /** "Rewards", "Points" — whatever this business calls it. */
  pointsName: string;
  currency?: string;
}) {
  const standing = tierFor(annualSpendCents, tiers);
  if (!standing) return null;

  const { current, next } = standing;
  const floor = current.minAnnualSpendCents;
  const ceiling = next?.minAnnualSpendCents ?? annualSpendCents;
  const span = Math.max(1, ceiling - floor);
  const progress = next
    ? Math.min(100, Math.max(4, ((annualSpendCents - floor) / span) * 100))
    : 100;
  const remaining = next ? next.minAnnualSpendCents - annualSpendCents : 0;

  return (
    <div className="px-4">
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-3.5">
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">
              {pointsName}
            </span>
            <span className="mt-0.5 block text-[22px] font-semibold leading-none tabular-nums">
              {points.toLocaleString()}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-[var(--color-brand-soft)] px-2.5 py-1 text-[13px] font-semibold text-[var(--color-brand)]">
            {current.name}
          </span>
        </div>

        {next && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress to ${next.name}`}
            >
              <div
                className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[13px] leading-snug text-[var(--color-muted)]">
              <span className="font-medium text-[var(--color-fg)]">
                {formatMoney(remaining, currency)} more
              </span>{' '}
              this year unlocks {next.name}
              {next.perks[0] ? ` — ${next.perks[0].toLowerCase()}` : ''}.
            </p>
          </div>
        )}

        {!next && current.perks.length > 0 && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <p className="text-[13px] leading-snug text-[var(--color-muted)]">
              Top tier. {current.perks.join(' · ')}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
