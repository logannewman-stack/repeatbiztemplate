import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBrand } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/demo';
import { vertical } from '@/config/verticals';
import {
  Card, CardBody, CardHeader, Badge, Button, Alert, Avatar, EmptyState, Stat,
} from '@/components/ui';
import { formatMoney, fullName, formatPhone, relativeDays, daysBetween } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) return { title: 'Client' };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('clients')
    .select('first_name, last_name')
    .eq('id', id)
    .maybeSingle();

  return { title: data ? fullName(data.first_name, data.last_name) : 'Client' };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId, currency, timezone } = await loadBrand();

  if (!isSupabaseConfigured() || !businessId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Client</h1>
        <Alert tone="warning" title="Demo mode">
          Client records need a database. Connect Supabase — see{' '}
          <code>SETUP.md</code>.
        </Alert>
      </div>
    );
  }

  const supabase = createAdminClient();

  const { data: client } = await supabase
    .from('clients')
    .select('*, client_metrics(*)')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!client) notFound();

  const metricsRaw = client.client_metrics;
  const metrics = (Array.isArray(metricsRaw) ? metricsRaw[0] : metricsRaw) ?? null;

  const [
    { data: appointments },
    { data: membership },
    { data: notes },
    { data: offers },
    { data: sends },
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, starts_at, status, price_cents, addons_cents, source, services(name), staff(display_name)')
      .eq('client_id', id)
      .order('starts_at', { ascending: false })
      .limit(25),
    supabase
      .from('memberships')
      .select('*, membership_plans(name, price_cents, billing_interval)')
      .eq('client_id', id)
      .in('status', ['active', 'trialing', 'past_due', 'paused', 'cancelling'])
      .maybeSingle(),
    supabase
      .from('client_notes')
      .select('*, staff(display_name)')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('offers')
      .select('*')
      .eq('client_id', id)
      .is('redeemed_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('campaign_sends')
      .select('id, channel, status, sent_at, skip_reason, converted_at, campaigns(name)')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const plan = membership?.membership_plans as unknown as {
    name: string; price_cents: number; billing_interval: string;
  } | null;

  const upcoming = (appointments ?? []).filter(
    (a) => new Date(a.starts_at) > new Date() &&
      ['requested', 'booked', 'confirmed'].includes(a.status)
  );
  const past = (appointments ?? []).filter((a) => !upcoming.includes(a));

  const dueInDays = metrics?.next_expected_at
    ? daysBetween(new Date(), String(metrics.next_expected_at))
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={fullName(client.first_name, client.last_name)} size="lg" />
          <div>
            <h1 className="text-2xl font-bold">
              {fullName(client.first_name, client.last_name)}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              {[client.email, formatPhone(client.phone)].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <LifecycleBadge lifecycle={String(metrics?.lifecycle ?? 'lead')} />
              {plan && <Badge tone="brand">{plan.name}</Badge>}
              {String(metrics?.loyalty_tier ?? '') !== 'Member' && metrics?.loyalty_tier && (
                <Badge tone="accent">{String(metrics.loyalty_tier)}</Badge>
              )}
              {Number(metrics?.no_show_risk ?? 0) >= 60 && (
                <Badge tone="warning">No-show risk {Number(metrics!.no_show_risk)}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {client.phone && (
            <a href={`tel:${client.phone.replace(/\D/g, '')}`}>
              <Button variant="secondary" size="sm">Call</Button>
            </a>
          )}
          <Link href={`/book?rebook=${client.id}`}>
            <Button size="sm">Book a {vertical.visitNoun}</Button>
          </Link>
        </div>
      </header>

      {client.alert_note && (
        <Alert tone="warning" title="Front desk note">{client.alert_note}</Alert>
      )}

      {/* --- Metrics ------------------------------------------------------ */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Lifetime value"
          value={formatMoney(Number(metrics?.lifetime_value_cents ?? 0), currency)}
          hint={`${Number(metrics?.completed_count ?? 0)} completed visits`}
        />
        <Stat
          label="Average ticket"
          value={formatMoney(Number(metrics?.avg_ticket_cents ?? 0), currency)}
          hint={
            Number(metrics?.retail_revenue_cents ?? 0) > 0
              ? `${formatMoney(Number(metrics!.retail_revenue_cents), currency)} of retail`
              : 'No retail yet'
          }
        />
        <Stat
          label="Visits every"
          value={
            metrics?.avg_days_between_visits
              ? `${Math.round(Number(metrics.avg_days_between_visits))}d`
              : '—'
          }
          hint={
            dueInDays == null
              ? 'Not enough history'
              : dueInDays > 0
                ? `Due ${relativeDays(dueInDays)}`
                : `${Math.abs(dueInDays)} days overdue`
          }
        />
        <Stat
          label="Attendance"
          value={`${Number(metrics?.no_show_count ?? 0)} / ${Number(metrics?.late_cancel_count ?? 0)}`}
          hint="No-shows / late cancels"
          tone={
            Number(metrics?.no_show_count ?? 0) > 0 ? 'warning' : undefined
          }
        />
      </section>

      {!metrics?.has_future_booking && Number(metrics?.completed_count ?? 0) > 0 && (
        <Alert tone="warning" title={`No next ${vertical.visitNoun} booked`}>
          {dueInDays != null && dueInDays < 0
            ? `${Math.abs(dueInDays)} days past their usual interval. This is the moment a call is worth making.`
            : `They are due ${dueInDays != null ? relativeDays(dueInDays) : 'soon'}.`}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* --- Upcoming --------------------------------------------- */}
          {upcoming.length > 0 && (
            <Card>
              <CardHeader title={`Upcoming`} />
              <CardBody className="px-0 pb-0">
                <ul className="divide-y divide-[var(--color-border)]">
                  {upcoming.map((a) => (
                    <AppointmentRow key={a.id} appointment={a} timezone={timezone} currency={currency} />
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {/* --- History ---------------------------------------------- */}
          <Card>
            <CardHeader
              title="Visit history"
              description={
                metrics?.rebook_rate
                  ? `${Number(metrics.rebook_rate)}% of their visits produced a rebooking at the chair.`
                  : undefined
              }
            />
            <CardBody className="px-0 pb-0">
              {past.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No visits yet" />
                </div>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {past.map((a) => (
                    <AppointmentRow key={a.id} appointment={a} timezone={timezone} currency={currency} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* --- Notes ------------------------------------------------ */}
          <Card>
            <CardHeader
              title="Notes"
              description="Formulas, preferences, and anything the next provider needs."
            />
            <CardBody className="px-0 pb-0">
              {!notes?.length ? (
                <div className="p-5">
                  <EmptyState
                    title="No notes yet"
                    description="Formula and preference notes are how a client keeps getting the same result when a different provider takes them."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {notes.map((note) => {
                    const author = note.staff as unknown as { display_name: string } | null;
                    return (
                      <li key={note.id} className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={note.kind === 'formula' ? 'brand' : 'neutral'}>
                            {note.kind}
                          </Badge>
                          <span className="text-xs text-[var(--color-muted)]">
                            {author?.display_name ?? 'Staff'} ·{' '}
                            {new Date(note.created_at).toLocaleDateString()}
                          </span>
                          {note.client_visible && (
                            <Badge tone="neutral">Visible to client</Badge>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {/* --- Membership -------------------------------------------- */}
          {membership && plan ? (
            <Card>
              <CardHeader
                title={plan.name}
                action={
                  <Badge tone={membership.status === 'active' ? 'success' : 'warning'}>
                    {membership.status}
                  </Badge>
                }
              />
              <CardBody className="text-sm">
                <p className="text-[var(--color-muted)]">
                  {formatMoney(plan.price_cents, currency)}/{plan.billing_interval}
                </p>
                <p>
                  <strong className="text-lg tabular-nums">{membership.credits_balance}</strong>{' '}
                  <span className="text-[var(--color-muted)]">credits available</span>
                </p>
                {membership.credits_balance > 2 && (
                  <Alert tone="warning">
                    Credits piling up. A member who never redeems is the one who
                    cancels next month — worth a call.
                  </Alert>
                )}
                {membership.cancel_at_period_end && (
                  <Alert tone="danger">
                    Cancelling at period end
                    {membership.current_period_end &&
                      ` (${new Date(membership.current_period_end).toLocaleDateString()})`}
                    .
                  </Alert>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Not a member"
                description={
                  Number(metrics?.spend_90d_cents ?? 0) > 0
                    ? `Spent ${formatMoney(Number(metrics!.spend_90d_cents), currency)} in the last 90 days.`
                    : undefined
                }
              />
              <CardBody>
                <p className="text-sm text-[var(--color-muted)]">
                  The membership pitch that converts is arithmetic about their own
                  spending, not a feature list.
                </p>
              </CardBody>
            </Card>
          )}

          {/* --- Offers ------------------------------------------------- */}
          {offers && offers.length > 0 && (
            <Card>
              <CardHeader title="Open offers" />
              <CardBody className="space-y-2 text-sm">
                {offers.map((offer) => (
                  <div key={offer.id} className="flex justify-between gap-2">
                    <span>{offer.label}</span>
                    <code className="text-xs">{offer.code}</code>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* --- Messages ----------------------------------------------- */}
          <Card>
            <CardHeader
              title="Recent messages"
              description="Including anything the engine chose not to send, and why."
            />
            <CardBody className="px-0 pb-0">
              {!sends?.length ? (
                <div className="p-5 text-sm text-[var(--color-muted)]">
                  Nothing sent yet.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--color-border)] text-sm">
                  {sends.map((send) => {
                    const campaign = send.campaigns as unknown as { name: string } | null;
                    return (
                      <li key={send.id} className="px-5 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{campaign?.name ?? 'Message'}</span>
                          <Badge
                            tone={
                              send.converted_at ? 'success'
                              : send.status === 'sent' || send.status === 'delivered' ? 'brand'
                              : send.status === 'skipped' ? 'neutral'
                              : 'warning'
                            }
                          >
                            {send.converted_at ? 'Booked' : send.status}
                          </Badge>
                        </div>
                        {send.skip_reason && (
                          <p className="text-xs text-[var(--color-muted)]">
                            Skipped: {send.skip_reason.replace(/_/g, ' ')}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AppointmentRow({
  appointment, timezone, currency,
}: {
  appointment: {
    id: string; starts_at: string; status: string;
    price_cents: number; addons_cents: number; source: string;
    services: unknown; staff: unknown;
  };
  timezone: string;
  currency: string;
}) {
  const service = appointment.services as { name: string } | null;
  const staffRow = appointment.staff as { display_name: string } | null;

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{service?.name ?? 'Service'}</p>
        <p className="text-xs text-[var(--color-muted)]">
          {new Date(appointment.starts_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone,
          })}
          {staffRow && ` · ${staffRow.display_name}`}
          {appointment.source === 'rebook_prompt' && ' · rebooked at checkout'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm tabular-nums">
          {formatMoney(appointment.price_cents + appointment.addons_cents, currency)}
        </p>
        <StatusBadge status={appointment.status} />
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'; label: string }> = {
    requested: { tone: 'warning', label: 'Requested' },
    booked: { tone: 'brand', label: 'Booked' },
    confirmed: { tone: 'success', label: 'Confirmed' },
    checked_in: { tone: 'success', label: 'Checked in' },
    in_progress: { tone: 'success', label: 'In chair' },
    completed: { tone: 'success', label: 'Done' },
    cancelled: { tone: 'danger', label: 'Cancelled' },
    no_show: { tone: 'danger', label: 'No-show' },
    rescheduled: { tone: 'neutral', label: 'Moved' },
  };
  const entry = map[status] ?? { tone: 'neutral' as const, label: status };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

function LifecycleBadge({ lifecycle }: { lifecycle: string }) {
  const map: Record<string, { tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'; label: string }> = {
    lead: { tone: 'neutral', label: 'Lead' },
    new: { tone: 'brand', label: 'New' },
    active: { tone: 'success', label: 'Active' },
    due: { tone: 'warning', label: 'Due' },
    at_risk: { tone: 'warning', label: 'At risk' },
    lapsed: { tone: 'danger', label: 'Lapsed' },
    recovered: { tone: 'success', label: 'Recovered' },
    vip: { tone: 'brand', label: 'VIP' },
  };
  const entry = map[lifecycle] ?? { tone: 'neutral' as const, label: lifecycle };
  return <Badge tone={entry.tone} dot>{entry.label}</Badge>;
}
