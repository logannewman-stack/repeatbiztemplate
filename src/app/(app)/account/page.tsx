/**
 * ============================================================================
 * ACCOUNT
 * ============================================================================
 * Where a browser becomes a client with a record — and the reason to open the
 * app on a day with nothing booked.
 *
 * Ordered by what a returning person came for:
 *
 *   1. an offer they have not spent, because issuing one nobody sees is waste
 *   2. what is booked, and whether it is confirmed
 *   3. where they stand — the tier gap is the one thing here that makes the
 *      next visit feel like progress rather than a chore
 *   4. what they have had before, each row one tap from having it again
 *   5. their membership, their settings, the way out
 *
 * Demo mode renders a plausible regular rather than a note about Supabase.
 * The account screen is where an owner evaluating this looks to understand
 * what their clients actually get, and an empty one answers nothing.
 * ============================================================================
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured, demoAccount, type DemoAccount } from '@/lib/demo';
import { brand } from '@/config/brand';
import { vertical } from '@/config/verticals';
import { rules } from '@/config/rules';
import { Alert, ButtonLink, EmptyState } from '@/components/ui';
import { formatMoney, relativeDays, daysBetween } from '@/lib/utils';
import {
  Screen, NotificationSetting, ListGroup, ListRow, ListLink, LoyaltyCard,
} from '@/components/app';
import { vapidPublicKey } from '@/lib/messaging/push';

export const metadata = { title: `My ${vertical.visitNounPlural}` };
export const dynamic = 'force-dynamic';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return <AccountView account={demoAccount()} demo />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return <SignedOut />;

  // RLS restricts every read below to this user's own rows.
  const { data: client } = await supabase
    .from('clients')
    .select('*, client_metrics(*)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!client) return <NoRecordYet />;

  const [{ data: upcoming }, { data: past }, { data: membership }, { data: offers }] =
    await Promise.all([
      supabase
        .from('appointments')
        .select('*, services(name, rebook_interval_days), staff(display_name)')
        .eq('client_id', client.id)
        .in('status', ['requested', 'booked', 'confirmed'])
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(10),
      supabase
        .from('appointments')
        .select('*, services(name, rebook_interval_days), staff(display_name)')
        .eq('client_id', client.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(5),
      supabase
        .from('memberships')
        .select('*, membership_plans(name, price_cents, included_credits, billing_interval)')
        .eq('client_id', client.id)
        .in('status', ['active', 'trialing', 'past_due', 'paused'])
        .maybeSingle(),
      supabase
        .from('offers')
        .select('*')
        .eq('client_id', client.id)
        .is('redeemed_at', null)
        .gte('expires_at', new Date().toISOString()),
    ]);

  const metrics = (Array.isArray(client.client_metrics)
    ? client.client_metrics[0]
    : client.client_metrics) as Record<string, unknown> | null;

  const plan = membership?.membership_plans as unknown as {
    name: string; price_cents: number; billing_interval: string;
  } | null;

  const named = <T,>(row: unknown, key: string): string =>
    ((row as Record<string, { [k: string]: string }> | null)?.[key] as unknown as
      { name?: string; display_name?: string } | null)?.name
    ?? ((row as Record<string, { display_name?: string }> | null)?.[key]?.display_name)
    ?? '';

  // The live shape is normalised into the same object demo mode builds, so
  // there is exactly one view to design and one to keep working.
  const account: DemoAccount = {
    firstName: client.first_name ?? 'there',
    loyaltyPoints: Number(metrics?.loyalty_points ?? 0),
    annualSpendCents: Number(metrics?.lifetime_value_cents ?? 0),
    upcoming: (upcoming ?? []).map((a) => ({
      id: a.id,
      serviceName: named(a, 'services') || vertical.visitNoun,
      staffName: named(a, 'staff'),
      startsAt: a.starts_at,
      confirmed: a.status === 'confirmed',
    })),
    past: (past ?? []).map((a) => ({
      id: a.id,
      serviceId: a.service_id ?? '',
      serviceName: named(a, 'services') || vertical.visitNoun,
      staffName: named(a, 'staff'),
      completedAt: a.completed_at ?? a.starts_at,
      // What they actually paid for the visit: the service plus anything
      // added, less any discount. There is no single total column.
      totalCents: (a.price_cents ?? 0) + (a.addons_cents ?? 0) - (a.discount_cents ?? 0),
    })),
    membership: plan
      ? {
          planName: plan.name,
          priceCents: plan.price_cents,
          interval: plan.billing_interval,
          creditsBalance: membership?.credits_balance ?? 0,
        }
      : null,
    offers: (offers ?? []).map((o) => ({
      id: o.id, label: o.label ?? 'An offer for you',
      code: o.code, expiresAt: o.expires_at ?? '',
    })),
  };

  const dueInDays = metrics?.next_expected_at
    ? daysBetween(new Date(), String(metrics.next_expected_at))
    : null;

  return (
    <AccountView
      account={account}
      dueInDays={dueInDays}
      pastDue={membership?.status === 'past_due'}
    />
  );
}

// --- The screen -------------------------------------------------------------

function AccountView({
  account, demo, dueInDays = null, pastDue = false,
}: {
  account: DemoAccount;
  demo?: boolean;
  dueInDays?: number | null;
  pastDue?: boolean;
}) {
  const next = account.upcoming[0] ?? null;

  return (
    <Screen
      title="Account"
      subtitle={`Hi ${account.firstName} — everything about your ${vertical.visitNounPlural} in one place.`}
    >
      {demo && (
        <div className="px-4 pb-1 pt-1">
          <Alert tone="warning" title="Sample data">
            This is what a returning client sees. Connect Supabase and it fills
            with real people — see <code>SETUP.md</code>.
          </Alert>
        </div>
      )}

      {/* Unspent offers first. There is no point issuing one nobody sees. */}
      {account.offers.map((offer) => (
        <div key={offer.id} className="px-4 pt-2">
          <div className="rounded-[var(--radius-card)] bg-[var(--color-accent)]/12 px-4 py-3.5 ring-1 ring-inset ring-[var(--color-accent)]/25">
            <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-accent)]">
              Waiting for you
            </p>
            <p className="mt-1 text-[17px] font-semibold leading-tight">{offer.label}</p>
            <p className="mt-1.5 text-[13px] text-[var(--color-muted)]">
              Code <span className="font-mono font-medium text-[var(--color-fg)]">{offer.code}</span>
              {offer.expiresAt && ` · expires ${shortDate(offer.expiresAt)}`}
            </p>
          </div>
        </div>
      ))}

      {/* --- What is booked ---------------------------------------------- */}
      {next ? (
        <ListGroup header={`Your next ${vertical.visitNoun}`}>
          <ListRow
            label={next.serviceName}
            detail={`${longWhen(next.startsAt)}${next.staffName ? ` · ${next.staffName}` : ''}`}
            value={
              next.confirmed ? (
                <span className="rounded-full bg-[var(--color-success-soft)] px-2 py-0.5 text-[12px] font-medium text-[var(--color-success)]">
                  Confirmed
                </span>
              ) : (
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[12px] font-medium text-[var(--color-muted)]">
                  Booked
                </span>
              )
            }
          />
          {!next.confirmed && (
            <ListLink
              href={`/a/${next.id}/confirm`}
              label={<span className="text-[var(--color-brand)]">Confirm this {vertical.visitNoun}</span>}
            />
          )}
          <ListLink href={`/account/appointments/${next.id}`} label="Change or cancel" />
        </ListGroup>
      ) : (
        <div className="px-4 pt-3">
          <EmptyState
            title="Nothing booked"
            description={
              dueInDays != null && dueInDays <= 7
                ? `Based on your history, you're about due.`
                : `Book your next ${vertical.visitNoun} and it will show up here.`
            }
            action={<ButtonLink href="/book">{brand.copy.rebookCta}</ButtonLink>}
          />
        </div>
      )}

      {/* --- Where they stand -------------------------------------------- */}
      {rules.loyalty.enabled && (
        <div className="pt-3">
          <LoyaltyCard
            points={account.loyaltyPoints}
            annualSpendCents={account.annualSpendCents}
            tiers={rules.loyalty.tiers}
            pointsName={brand.copy.loyaltyName}
          />
        </div>
      )}

      {/* --- What they have had before ------------------------------------ */}
      {account.past.length > 0 && (
        <ListGroup
          header="Recent visits"
          footer={
            dueInDays != null
              ? dueInDays > 0
                ? `Based on your history, you're due ${relativeDays(dueInDays)}.`
                : `You're about due for your next ${vertical.visitNoun}.`
              : 'Tap any of these to book the same thing again.'
          }
        >
          {account.past.map((visit) => (
            <ListLink
              key={visit.id}
              href={`/book?service=${visit.serviceId}`}
              label={visit.serviceName}
              detail={`${shortDate(visit.completedAt)}${visit.staffName ? ` · ${visit.staffName}` : ''}`}
              value={visit.totalCents > 0 ? formatMoney(visit.totalCents) : undefined}
            />
          ))}
        </ListGroup>
      )}

      {/* --- Membership ---------------------------------------------------- */}
      {account.membership ? (
        <ListGroup header={brand.copy.membershipName}>
          <ListRow
            label={account.membership.planName}
            detail={`${formatMoney(account.membership.priceCents)}/${account.membership.interval}`}
            value={
              account.membership.creditsBalance > 0 ? (
                <span className="font-medium text-[var(--color-brand)]">
                  {account.membership.creditsBalance} credit
                  {account.membership.creditsBalance === 1 ? '' : 's'}
                </span>
              ) : undefined
            }
          />
          <ListLink href="/account/membership" label="Manage membership" />
        </ListGroup>
      ) : (
        <ListGroup header={brand.copy.membershipName} footer={brand.copy.membershipPitch}>
          <ListLink
            href="/memberships"
            label={`See ${brand.copy.membershipName.toLowerCase()}s`}
          />
        </ListGroup>
      )}

      {pastDue && (
        <div className="px-4 pt-1">
          <Alert tone="danger" title="We couldn't process your payment">
            Your benefits stay active for a few more days. Update your card to
            keep them.
          </Alert>
        </div>
      )}

      {account.membership && account.membership.creditsBalance > 0 && (
        <div className="px-4 pt-1">
          <Alert tone="brand">
            You have {account.membership.creditsBalance} included{' '}
            {account.membership.creditsBalance === 1
              ? vertical.visitNoun
              : vertical.visitNounPlural}{' '}
            waiting. Book before they roll off.
          </Alert>
        </div>
      )}

      <NotificationSetting
        vapidPublicKey={vapidPublicKey()}
        visitNoun={vertical.visitNoun}
        preview={demo}
      />

      {!demo && (
        <ListGroup>
          <ListLink href="/policies" label="Policies" />
          <ListRow
            label={
              <form action="/auth/signout" method="post">
                <button type="submit" className="text-[var(--color-danger)]">
                  Sign out
                </button>
              </form>
            }
          />
        </ListGroup>
      )}

      <p className="px-6 pt-2 text-center text-[13px] leading-snug text-[var(--color-muted)]">
        Free changes up to {rules.cancellation.freeCancellationHours} hours before
        any {vertical.visitNoun}.
      </p>
    </Screen>
  );
}

// --- The states before there is an account ----------------------------------

function SignedOut() {
  return (
    <Screen
      title="Your account"
      subtitle={`Everything about your ${vertical.visitNounPlural} in one place.`}
      footer={<ButtonLink href="/login" fullWidth size="lg">Sign in with email</ButtonLink>}
    >
      <ListGroup>
        <ListRow
          icon={<AccountIcon path="M3.2 5h17.6v16H3.2zM8 3v4M16 3v4M3.6 10.2h16.8" />}
          label={`Your ${vertical.visitNounPlural}`}
          detail="Change or cancel without calling"
        />
        <ListRow
          icon={<AccountIcon path="M18 8.6a6 6 0 1 0-12 0c0 6-2.2 7.4-2.2 7.4h16.4S18 14.6 18 8.6M13.7 20a2 2 0 0 1-3.4 0" />}
          label="Reminders before every visit"
          detail="And first refusal when a slot opens up"
        />
        <ListRow
          icon={<AccountIcon path="M21 12a9 9 0 1 1-2.6-6.4M21 3.5V10h-6.5" />}
          label="One-tap rebooking"
          detail="Your usual, at your usual interval"
        />
        <ListRow
          icon={<AccountIcon path="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9z" />}
          label={`${brand.copy.membershipName} and credits`}
          detail="Balances, billing, and what is included"
        />
      </ListGroup>

      <p className="px-5 pt-1 text-[13px] leading-snug text-[var(--color-muted)]">
        No password — we email you a link. Prefer not to?{' '}
        <Link
          href="/book"
          className="inline-block py-2 font-medium text-[var(--color-brand)]"
        >
          Book without an account
        </Link>
        .
      </p>
    </Screen>
  );
}

function NoRecordYet() {
  return (
    <Screen title="Account">
      <div className="px-4 pt-3">
        <EmptyState
          title="No bookings yet"
          description={`Book your first ${vertical.visitNoun} and it will show up here.`}
          action={<ButtonLink href="/book">{brand.copy.bookCta}</ButtonLink>}
        />
      </div>
      <NotificationSetting
        vapidPublicKey={vapidPublicKey()}
        visitNoun={vertical.visitNoun}
      />
    </Screen>
  );
}

// --- Helpers ----------------------------------------------------------------

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function longWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

/** Leading glyph for the signed-out benefit rows. */
function AccountIcon({ path }: { path: string }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}
