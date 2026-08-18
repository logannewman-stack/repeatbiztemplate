import { loadDashboardKpis, loadMonthlySeries } from '@/lib/admin/queries';
import { rules } from '@/config/rules';
import { brand } from '@/config/brand';
import { demoPlans, isSupabaseConfigured } from '@/lib/demo';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { Card, CardHeader, CardBody, Badge, Alert, Button } from '@/components/ui';
import { formatMoney } from '@/lib/utils';

export const metadata = { title: 'Memberships' };

export default async function MembershipsPage() {
  const [{ kpis, demo }, { series }] = await Promise.all([
    loadDashboardKpis(),
    loadMonthlySeries(),
  ]);

  let plans = demoPlans().map((p) => ({
    id: p.id, name: p.name, price_cents: p.price_cents,
    billing_interval: p.billing_interval, included_credits: p.included_credits,
    discount_pct: p.discount_pct, memberCount: 0, stripeReady: false,
  }));

  if (isSupabaseConfigured()) {
    const business = await loadBusiness();
    if (business) {
      const supabase = createAdminClient();
      const [{ data: planRows }, { data: memberships }] = await Promise.all([
        supabase.from('membership_plans').select('*').eq('business_id', business.id).eq('active', true).order('sort_order'),
        supabase.from('memberships').select('plan_id, status').eq('business_id', business.id),
      ]);

      const counts = (memberships ?? []).reduce<Record<string, number>>((acc, m) => {
        if (['active', 'trialing', 'past_due'].includes(m.status)) {
          acc[m.plan_id] = (acc[m.plan_id] ?? 0) + 1;
        }
        return acc;
      }, {});

      plans = (planRows ?? []).map((p) => ({
        id: p.id, name: p.name, price_cents: p.price_cents,
        billing_interval: (p.billing_interval === 'year' ? 'year' : 'month') as 'month' | 'year',
        included_credits: p.included_credits,
        discount_pct: p.discount_pct,
        memberCount: counts[p.id] ?? 0,
        stripeReady: Boolean(p.stripe_price_id),
      }));
    }
  }

  const netLast3 = series.slice(-3).reduce(
    (sum, m) => sum + m.newMembers - m.churnedMembers, 0
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{brand.copy.membershipName}s</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Recurring revenue, and the flows that keep it from leaking.
        </p>
      </header>

      {demo && <Alert tone="warning" title="Demo data">Connect Supabase for real figures.</Alert>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">MRR</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(kpis.mrrCents)}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {formatMoney(kpis.mrrCents * 12)} annualized
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Active members</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{kpis.activeMembers}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Net {netLast3 >= 0 ? '+' : ''}{netLast3} over 3 months
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Past due</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{kpis.pastDueMembers}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Dunning in progress</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">At-risk MRR</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-warning)]">
            {formatMoney(kpis.atRiskMrrCents)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Cancelling at period end</p>
        </Card>
      </section>

      <Card>
        <CardHeader
          title="Plans"
          description="Edit pricing and benefits here; Stripe products are created on save."
        />
        <CardBody className="px-0 pb-0">
          <div className="scroll-x">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="border-y border-[var(--color-border)] bg-[var(--color-surface-2)] text-left">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">Plan</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Included</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Discount</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Members</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">MRR</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Stripe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td className="px-5 py-3 font-medium">{plan.name}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatMoney(plan.price_cents)}/{plan.billing_interval === 'year' ? 'yr' : 'mo'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {plan.included_credits || '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{plan.discount_pct}%</td>
                    <td className="px-3 py-3 text-right tabular-nums">{plan.memberCount}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatMoney(
                        plan.memberCount *
                          (plan.billing_interval === 'year'
                            ? Math.round(plan.price_cents / 12)
                            : plan.price_cents)
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {plan.stripeReady
                        ? <Badge tone="success">Synced</Badge>
                        : <Badge tone="warning">Not synced</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Save flow"
            description="What a member sees when they start to cancel, in order."
          />
          <CardBody>
            <ol className="space-y-3">
              {rules.memberships.saveFlow.offers.map((offer, i) => (
                <li key={offer.kind} className="flex gap-3">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-xs font-semibold text-[var(--color-brand)]"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{offer.label}</p>
                    <p className="text-sm text-[var(--color-muted)]">{offer.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-[var(--color-muted)]">
              A member is never shown an offer they already declined. Pause comes
              first because a paused member keeps their rate, their credits, and
              their habit — and comes back with one click.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Failed payment recovery"
            description="Most involuntary churn is an expired card, not a decision."
          />
          <CardBody className="space-y-3 text-sm">
            <p className="text-[var(--color-muted)]">
              Retries run on day{' '}
              {rules.memberships.dunning.retryDayOffsets.join(', ')} after a
              failure. Benefits stay active for{' '}
              {rules.memberships.dunning.graceDays} days so nobody is turned away
              at the desk over a billing problem.
            </p>
            <p className="text-[var(--color-muted)]">
              When retries are exhausted the membership{' '}
              {rules.memberships.dunning.pauseOnFailure
                ? 'pauses rather than cancels — a paused member can be revived with a card update, a cancelled one has to be re-sold.'
                : 'is cancelled.'}
            </p>
            {kpis.pastDueMembers > 0 && (
              <Alert tone="warning">
                {kpis.pastDueMembers} member{kpis.pastDueMembers === 1 ? '' : 's'}{' '}
                currently past due.
              </Alert>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Selling more memberships"
          description="The pitch that converts is arithmetic, not features."
        />
        <CardBody className="space-y-3 text-sm text-[var(--color-muted)]">
          <p>
            The <code>membership_pitch</code> campaign targets clients whose
            trailing {rules.memberships.spendLookbackDays}-day spend already
            exceeds the plan price, and shows them what they would have paid.
            It converts because it is a true statement about their own money.
          </p>
          <p>
            The booking flow makes the same comparison live, using the ticket in
            front of the client, and only when the plan genuinely saves them
            money. Pitching a bad deal costs more trust than the sale is worth.
          </p>
          <div className="pt-1">
            <Button size="sm" variant="secondary">Review campaign copy</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
