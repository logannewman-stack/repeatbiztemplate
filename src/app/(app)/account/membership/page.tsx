import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBrand } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/demo';
import { resolveRules } from '@/lib/rules';
import { availableSaveOffers } from '@/lib/stripe/subscriptions';
import { vertical } from '@/config/verticals';
import {
  Alert, Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState,
} from '@/components/ui';
import { MembershipManager } from '@/components/booking/MembershipManager';
import { formatMoney } from '@/lib/utils';
import { Screen } from '@/components/app';

export const metadata = { title: 'My membership' };
export const dynamic = 'force-dynamic';

export default async function MembershipPage() {
  const { brand, currency } = await loadBrand();

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Screen title={'Membership'} back={{ href: '/account' }}><div className="px-4">
          <Alert tone="warning" title="Demo mode">
            Membership management needs a database. Connect Supabase — see{' '}
            <code>SETUP.md</code>.
          </Alert>
        </div></Screen>
      </>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <Screen title={'Membership'} back={{ href: '/account' }}><div className="px-4">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="mt-2 text-[var(--color-muted)]">
            We&apos;ll email you a link — no password to remember.
          </p>
          <ButtonLink
            href="/login?next=/account/membership"
            className="mt-6"
            fullWidth
            size="lg"
          >
            Continue
          </ButtonLink>
        </div></Screen>
      </>
    );
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, business_id, first_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!client) {
    return (
      <>
        <Screen title={'Membership'} back={{ href: '/account' }}><div className="px-4">
          <EmptyState
            title="No account yet"
            description={`Book your first ${vertical.visitNoun} and your membership options will show up here.`}
            action={<ButtonLink href="/book">{brand.copy.bookCta}</ButtonLink>}
          />
        </div></Screen>
      </>
    );
  }

  const admin = createAdminClient();

  const [{ data: membership }, { data: business }, { data: plans }] = await Promise.all([
    admin
      .from('memberships')
      .select('*, membership_plans(*)')
      .eq('client_id', client.id)
      .in('status', ['active', 'trialing', 'past_due', 'paused', 'cancelling'])
      .maybeSingle(),
    admin.from('businesses').select('policy').eq('id', client.business_id).single(),
    admin
      .from('membership_plans')
      .select('id, name, price_cents, billing_interval, included_credits, discount_pct')
      .eq('business_id', client.business_id)
      .eq('active', true)
      .order('price_cents'),
  ]);

  const rules = resolveRules(business?.policy);

  if (!membership) {
    return (
      <>
        <Screen title={'Membership'} back={{ href: '/account' }}><div className="px-4">
          <h1 className="text-2xl font-bold">{brand.copy.membershipName}</h1>
          <EmptyState
            title="You're not a member yet"
            description={brand.copy.membershipPitch}
            action={
              <ButtonLink
                href="/memberships"
              >
                See {brand.copy.membershipName.toLowerCase()}s
              </ButtonLink>
            }
          />
        </div></Screen>
      </>
    );
  }

  const plan = membership.membership_plans as unknown as {
    id: string; name: string; price_cents: number; billing_interval: string;
    included_credits: number; discount_pct: number; allow_pause: boolean;
    commitment_months: number; rollover_periods: number;
  };

  // Only offers this member has not already declined, and that their plan allows.
  const saveOffers = availableSaveOffers(
    membership,
    plan,
    (plans ?? []).filter((p) => p.id !== plan.id),
    rules
  );

  const { data: ledger } = await admin
    .from('membership_credit_ledger')
    .select('delta, reason, created_at, expires_at')
    .eq('membership_id', membership.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <>
      <Screen title={'Membership'} back={{ href: '/account' }}><div className="px-4">
        <header>
          <h1 className="text-2xl font-bold">{plan.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {formatMoney(plan.price_cents, currency)}/{plan.billing_interval}
            {membership.current_period_end &&
              ` · renews ${new Date(membership.current_period_end).toLocaleDateString()}`}
          </p>
        </header>

        <MembershipManager
          membership={{
            id: membership.id,
            status: membership.status,
            creditsBalance: membership.credits_balance,
            creditsUsedThisPeriod: membership.credits_used_this_period,
            includedCredits: plan.included_credits,
            currentPeriodEnd: membership.current_period_end,
            pausedUntil: membership.paused_until,
            cancelAtPeriodEnd: membership.cancel_at_period_end,
            planName: plan.name,
            priceCents: plan.price_cents,
            interval: plan.billing_interval,
            rolloverPeriods: plan.rollover_periods,
          }}
          saveOffers={saveOffers.map((o) => ({
            kind: o.kind, label: o.label, description: o.description, value: o.value,
          }))}
          otherPlans={(plans ?? [])
            .filter((p) => p.id !== plan.id)
            .map((p) => ({
              id: p.id, name: p.name, priceCents: p.price_cents,
              interval: p.billing_interval, includedCredits: p.included_credits,
            }))}
          currency={currency}
          visitNoun={vertical.visitNoun}
          maxPauseMonths={rules.memberships.maxPauseMonths}
        />

        {ledger && ledger.length > 0 && (
          <Card>
            <CardHeader title="Credit history" />
            <CardBody className="px-0 pb-0">
              <ul className="divide-y divide-[var(--color-border)] text-sm">
                {ledger.map((row, i) => (
                  <li key={i} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-[var(--color-muted)]">
                      {row.reason.replace(/_/g, ' ')}
                      <span className="ml-2 text-xs">
                        {new Date(row.created_at).toLocaleDateString()}
                      </span>
                    </span>
                    <Badge tone={row.delta > 0 ? 'success' : 'neutral'}>
                      {row.delta > 0 ? '+' : ''}{row.delta}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div></Screen>
    </>
  );
}
