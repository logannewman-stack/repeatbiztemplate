import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/demo';
import { brand } from '@/config/brand';
import { vertical } from '@/config/verticals';
import { rules } from '@/config/rules';
import { Card, CardHeader, CardBody, Badge, Button, Alert, EmptyState } from '@/components/ui';
import { formatMoney, relativeDays, daysBetween } from '@/lib/utils';
import { Screen, NotificationSetting, ListGroup, ListRow } from '@/components/app';
import { vapidPublicKey } from '@/lib/messaging/push';

export const metadata = { title: `My ${vertical.visitNounPlural}` };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <Screen title={'Account'}><div className="px-4">
          <Alert tone="warning" title="Demo mode">
            The client portal needs a database. Connect Supabase to sign in and
            manage {vertical.visitNounPlural} — see <code>SETUP.md</code>.
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
        {/* This is where a browser becomes a client with a record, which is
            the whole retention mechanism — so it has to say what an account is
            for rather than just presenting a button. */}
        <Screen
          title={'Your account'}
          subtitle={`Everything about your ${vertical.visitNounPlural} in one place.`}
          footer={
            <Link href="/login" className="block">
              <Button fullWidth size="lg">Sign in with email</Button>
            </Link>
          }
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
            <Link href="/book" className="font-medium text-[var(--color-brand)]">
              Book without an account
            </Link>
            .
          </p>
        </Screen>
      </>
    );
  }

  // RLS restricts every read below to this user's own rows.
  const { data: client } = await supabase
    .from('clients')
    .select('*, client_metrics(*)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!client) {
    return (
      <>
        <Screen title={'Account'}><div className="px-4">
          <EmptyState
            title="No bookings yet"
            description={`Book your first ${vertical.visitNoun} and it will show up here.`}
            action={<Link href="/book"><Button>{brand.copy.bookCta}</Button></Link>}
          />
        </div>

        {/* Outside the padded column: the setting draws its own inset
            group, matching every other list on the account screen. */}
        <NotificationSetting
          vapidPublicKey={vapidPublicKey()}
          visitNoun={vertical.visitNoun}
        />
      </Screen>
      </>
    );
  }

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

  const lastVisit = past?.[0];
  const dueInDays = metrics?.next_expected_at
    ? daysBetween(new Date(), String(metrics.next_expected_at))
    : null;

  const plan = membership?.membership_plans as unknown as {
    name: string; price_cents: number; included_credits: number; billing_interval: string;
  } | null;

  return (
    <>
      <Screen title={'Account'}><div className="px-4">
        <header>
          <h1 className="text-2xl font-bold">Hi {client.first_name}</h1>
          {metrics?.loyalty_points ? (
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {String(metrics.loyalty_points)} {brand.copy.loyaltyName.toLowerCase()} points ·{' '}
              {String(metrics.loyalty_tier ?? 'Member')}
            </p>
          ) : null}
        </header>

        {/* Unredeemed offers first — no point issuing them if nobody sees them. */}
        {offers && offers.length > 0 && (
          <Alert tone="accent" title="You have an offer waiting">
            {offers.map((offer) => (
              <p key={offer.id} className="mt-1">
                {offer.label} — code <strong>{offer.code}</strong>
                {offer.expires_at && (
                  <span className="text-[var(--color-muted)]">
                    {' '}(expires {new Date(offer.expires_at).toLocaleDateString()})
                  </span>
                )}
              </p>
            ))}
          </Alert>
        )}

        {/* --- Upcoming --------------------------------------------------- */}
        <Card>
          <CardHeader title={`Upcoming ${vertical.visitNounPlural}`} />
          <CardBody>
            {!upcoming?.length ? (
              <div className="space-y-4">
                <EmptyState
                  title={`Nothing booked`}
                  description={
                    dueInDays != null && dueInDays <= 7
                      ? `Based on your last ${vertical.visitNounPlural}, you're about due.`
                      : undefined
                  }
                />
                <Link href="/book">
                  <Button fullWidth>{brand.copy.rebookCta}</Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((appointment) => {
                  const service = appointment.services as unknown as { name: string } | null;
                  const staffRow = appointment.staff as unknown as { display_name: string } | null;
                  return (
                    <li
                      key={appointment.id}
                      className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{service?.name}</p>
                          <p className="text-sm text-[var(--color-muted)]">
                            {new Date(appointment.starts_at).toLocaleString('en-US', {
                              weekday: 'long', month: 'long', day: 'numeric',
                              hour: 'numeric', minute: '2-digit',
                            })}
                          </p>
                          <p className="text-sm text-[var(--color-muted)]">
                            with {staffRow?.display_name}
                          </p>
                        </div>
                        <Badge tone={appointment.status === 'confirmed' ? 'success' : 'neutral'}>
                          {appointment.status === 'confirmed' ? 'Confirmed' : 'Booked'}
                        </Badge>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Link href={`/account/appointments/${appointment.id}`} className="flex-1">
                          <Button size="sm" variant="secondary" fullWidth>
                            Change or cancel
                          </Button>
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* --- Membership -------------------------------------------------- */}
        {membership && plan && (
          <Card>
            <CardHeader
              title={plan.name}
              action={
                <Badge tone={membership.status === 'active' ? 'success' : 'warning'}>
                  {membership.status === 'paused' ? 'Paused' :
                   membership.status === 'past_due' ? 'Payment issue' : 'Active'}
                </Badge>
              }
            />
            <CardBody>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-[var(--color-muted)]">
                  {formatMoney(plan.price_cents)}/{plan.billing_interval}
                </p>
                <p className="text-sm">
                  <strong className="text-lg tabular-nums">{membership.credits_balance}</strong>{' '}
                  <span className="text-[var(--color-muted)]">
                    credit{membership.credits_balance === 1 ? '' : 's'} available
                  </span>
                </p>
              </div>

              {membership.credits_balance > 0 && (
                <Alert tone="brand">
                  You have {membership.credits_balance} included{' '}
                  {membership.credits_balance === 1 ? vertical.visitNoun : vertical.visitNounPlural}{' '}
                  waiting. Book before they roll off.
                </Alert>
              )}

              {membership.status === 'past_due' && (
                <Alert tone="danger" title="We couldn't process your payment">
                  Your benefits stay active for a few more days. Update your card
                  to keep them.
                </Alert>
              )}

              <div className="mt-4 flex gap-2">
                <Link href="/account/membership" className="flex-1">
                  <Button size="sm" variant="secondary" fullWidth>
                    Manage membership
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        )}

        {!membership && (
          <Card>
            <CardHeader
              title={brand.copy.membershipName}
              description={brand.copy.membershipPitch}
            />
            <CardBody>
              <Link href="/memberships">
                <Button variant="secondary" fullWidth>
                  See {brand.copy.membershipName.toLowerCase()}s
                </Button>
              </Link>
            </CardBody>
          </Card>
        )}

        {/* --- History ----------------------------------------------------- */}
        {past && past.length > 0 && (
          <Card>
            <CardHeader
              title="Recent visits"
              description={
                lastVisit && dueInDays != null
                  ? dueInDays > 0
                    ? `Based on your history, you're due ${relativeDays(dueInDays)}.`
                    : `You're about due for your next ${vertical.visitNoun}.`
                  : undefined
              }
            />
            <CardBody>
              <ul className="divide-y divide-[var(--color-border)]">
                {past.map((appointment) => {
                  const service = appointment.services as unknown as { name: string } | null;
                  const staffRow = appointment.staff as unknown as { display_name: string } | null;
                  return (
                    <li key={appointment.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{service?.name}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {appointment.completed_at &&
                            new Date(appointment.completed_at).toLocaleDateString()}
                          {staffRow && ` · ${staffRow.display_name}`}
                        </p>
                      </div>
                      <Link href={`/book?service=${appointment.service_id}&staff=${appointment.staff_id ?? ''}`}>
                        <Button size="sm" variant="ghost">Book again</Button>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        )}

        <p className="text-center text-xs text-[var(--color-muted)]">
          Free changes up to {rules.cancellation.freeCancellationHours} hours before
          any {vertical.visitNoun}.
        </p>
      </div></Screen>
    </>
  );
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
