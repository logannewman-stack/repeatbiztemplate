import { loadImpact, annualised } from '@/lib/admin/impact';
import { loadBrand } from '@/lib/brand';
import { Card, CardHeader, CardBody, Alert, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';

export const metadata = { title: 'Impact' };

/**
 * The renewal screen.
 *
 * Every other report says what the business looks like now. This one says
 * what changed since it went live and what that was worth — against the
 * business's own first thirty days, because an owner will argue with an
 * industry benchmark and cannot argue with their own opening numbers.
 *
 * It is built to be read aloud in a quarterly review and screenshotted
 * afterwards, so the top line is a single figure and everything under it
 * exists to show that figure's working.
 */
export default async function ImpactPage() {
  const [impact, { brand, currency }] = await Promise.all([
    loadImpact(),
    loadBrand(),
  ]);

  const money = (cents: number) => formatMoney(cents, currency);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Impact</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          What has changed at {brand.name} since launch, measured against its
          own first 30 days.
        </p>
      </header>

      {impact.demo && (
        <Alert tone="warning" title="Demo data">
          Illustrative figures. Connect Supabase and these become this
          business&rsquo;s real numbers.
        </Alert>
      )}

      {!impact.comparable ? (
        <Alert tone="brand" title="Not enough history yet">
          Impact compares the trailing 30 days against the first 30. That needs
          60 days of trading — this business is {impact.daysLive} days in, with{' '}
          {impact.lifetimeAppointments.toLocaleString()} appointments recorded
          so far. The comparison unlocks on day 60.
        </Alert>
      ) : (
        <>
          {/* --- The number ------------------------------------------------ */}
          <Card>
            <CardBody>
              <p className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Additional monthly revenue
              </p>
              <p className="mt-1 text-5xl font-bold tabular-nums tracking-tight text-[var(--color-brand)]">
                {money(impact.totalValueCents)}
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                {money(annualised(impact))} annualised, from three changes
                measured over {impact.daysLive} days live.
              </p>
            </CardBody>
          </Card>

          {/* --- The working ----------------------------------------------- */}
          <div className="grid gap-6 lg:grid-cols-3">
            <ImpactCard
              title="Rebooking"
              description="Clients leaving with the next visit booked."
              before={impact.rebookRateBaseline}
              after={impact.rebookRateCurrent}
              unit="%"
              higherIsBetter
              value={money(impact.rebookingValueCents)}
              working={`${fmtDelta(impact.rebookRateDelta)} points on ${impact.bookedCurrent} appointments at ${money(impact.avgTicketCents)}`}
            />

            <ImpactCard
              title="No-shows"
              description="Booked chairs that stayed empty."
              before={impact.noShowRateBaseline}
              after={impact.noShowRateCurrent}
              unit="%"
              higherIsBetter={false}
              value={money(impact.noShowValueCents)}
              working={
                impact.feesRecoveredCents > 0
                  ? `Plus ${money(impact.feesRecoveredCents)} collected in late-cancellation fees`
                  : 'Revenue that would have walked out at the old rate'
              }
            />

            <ImpactCard
              title="Memberships"
              description="Recurring revenue that did not exist before."
              before={impact.mrrCentsBaseline / 100}
              after={impact.mrrCentsCurrent / 100}
              unit=""
              money
              currency={currency}
              higherIsBetter
              value={money(impact.membershipValueCents)}
              working={`${impact.membersCurrent} active members billing monthly`}
            />
          </div>

          <Card>
            <CardHeader
              title="How these are calculated"
              description="So the numbers survive being questioned."
            />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Calc term="Rebooking">
                  The rise in rebooking rate, applied to visits completed in the
                  last 30 days, priced at the current average ticket. Counts
                  only visits where the client left with a future appointment
                  actually on the books.
                </Calc>
                <Calc term="No-shows">
                  The fall in no-show rate, applied to appointments booked in
                  the last 30 days, priced at the current average ticket — the
                  revenue that would have been lost at the opening rate.
                </Calc>
                <Calc term="Memberships">
                  Current monthly recurring revenue from active memberships,
                  less whatever was recurring at the baseline. Paused
                  memberships are excluded because they are not billing.
                </Calc>
                <Calc term="What is not counted">
                  Front-desk time saved, referrals, retail attachment, and any
                  visit booked more than seven days after the one that prompted
                  it. The real figure is higher than the one above.
                </Calc>
              </dl>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function fmtDelta(delta: number): string {
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
}

function ImpactCard({
  title, description, before, after, unit, value, working,
  higherIsBetter, money: isMoney, currency,
}: {
  title: string;
  description: string;
  before: number | null;
  after: number | null;
  unit: string;
  value: string;
  working: string;
  higherIsBetter: boolean;
  money?: boolean;
  currency?: string;
}) {
  const has = before !== null && after !== null;
  const improved = has && (higherIsBetter ? after! > before! : after! < before!);
  const flat = has && after === before;

  const show = (n: number | null) => {
    if (n === null) return '—';
    return isMoney
      ? formatMoney(Math.round(n * 100), currency)
      : `${n.toFixed(1)}${unit}`;
  };

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <div className="flex items-baseline gap-3">
          <span className="text-lg tabular-nums text-[var(--color-muted)] line-through decoration-1">
            {show(before)}
          </span>
          <span aria-hidden className="text-[var(--color-muted)]">→</span>
          <span className="text-3xl font-bold tabular-nums">{show(after)}</span>
        </div>

        <div className="mt-2">
          {flat ? (
            <Badge tone="neutral">No change</Badge>
          ) : improved ? (
            <Badge tone="success">Improved</Badge>
          ) : (
            // Said plainly. A metric that slipped is the most useful thing on
            // the page, and hiding it is how a report stops being believed.
            <Badge tone="danger">Down on baseline</Badge>
          )}
        </div>

        <p className="mt-4 text-2xl font-semibold tabular-nums text-[var(--color-brand)]">
          {value}
          <span className="ml-1 text-sm font-normal text-[var(--color-muted)]">
            /mo
          </span>
        </p>
        <p className="mt-1 text-xs leading-snug text-[var(--color-muted)]">
          {working}
        </p>
      </CardBody>
    </Card>
  );
}

function Calc({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium">{term}</dt>
      <dd className="mt-0.5 text-[var(--color-muted)]">{children}</dd>
    </div>
  );
}
