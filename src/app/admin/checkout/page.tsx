import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBrand } from '@/lib/brand';
import { isSupabaseConfigured } from '@/lib/demo';
import { resolveRules } from '@/lib/rules';
import { vertical } from '@/config/verticals';
import { Alert, Card, CardBody, CardHeader, Badge, Button, EmptyState, Avatar } from '@/components/ui';
import { CheckoutTerminal } from '@/components/admin/CheckoutTerminal';
import { formatMoney, fullName } from '@/lib/utils';

export const metadata = { title: 'Checkout' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string }>;
}) {
  const params = await searchParams;
  const { businessId, timezone, currency } = await loadBrand();

  if (!isSupabaseConfigured() || !businessId) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Checkout</h1>
        </header>
        <Alert tone="warning" title="Demo mode">
          Checkout writes real orders and payments, so it needs a database.
          Connect Supabase — see <code>SETUP.md</code>.
        </Alert>
      </div>
    );
  }

  const supabase = createAdminClient();
  const { data: business } = await supabase
    .from('businesses')
    .select('policy')
    .eq('id', businessId)
    .single();
  const rules = resolveRules(business?.policy);

  // --- No appointment picked: show today's list --------------------------

  if (!params.appointment) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const { data: today } = await supabase
      .from('appointments')
      .select(`
        id, starts_at, status, price_cents, addons_cents, order_id,
        clients(first_name, last_name),
        services(name),
        staff(display_name, color)
      `)
      .eq('business_id', businessId)
      .gte('starts_at', dayStart.toISOString())
      .lt('starts_at', dayEnd.toISOString())
      .in('status', ['booked', 'confirmed', 'checked_in', 'in_progress', 'completed'])
      .order('starts_at');

    const rows = (today ?? []) as unknown as Array<{
      id: string; starts_at: string; status: string;
      price_cents: number; addons_cents: number; order_id: string | null;
      clients: { first_name: string; last_name: string | null } | null;
      services: { name: string } | null;
      staff: { display_name: string; color: string | null } | null;
    }>;

    const open = rows.filter((r) => !r.order_id);
    const done = rows.filter((r) => r.order_id);
    const collected = done.reduce((sum, r) => sum + r.price_cents + r.addons_cents, 0);

    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Checkout</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Pick a {vertical.visitNoun} to ring up.
            </p>
          </div>
          {done.length > 0 && (
            <Badge tone="success">
              {formatMoney(collected, currency)} collected today
            </Badge>
          )}
        </header>

        {open.length === 0 ? (
          <EmptyState
            title="Nothing waiting to check out"
            description={`Everything on today's book is either done or not started. Check the calendar for what is coming.`}
            action={
              <Link href="/admin/calendar">
                <Button>Open calendar</Button>
              </Link>
            }
          />
        ) : (
          <Card>
            <CardHeader
              title={`${open.length} waiting`}
              description="Ring up, take payment, and book the next visit in one flow."
            />
            <CardBody className="px-0 pb-0">
              <ul className="divide-y divide-[var(--color-border)]">
                {open.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/admin/checkout?appointment=${row.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--color-surface-2)]"
                    >
                      <span className="w-16 shrink-0 text-sm font-medium tabular-nums">
                        {new Date(row.starts_at).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', timeZone: timezone,
                        })}
                      </span>
                      <Avatar
                        name={fullName(row.clients?.first_name, row.clients?.last_name)}
                        color={row.staff?.color}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {fullName(row.clients?.first_name, row.clients?.last_name)}
                        </span>
                        <span className="block truncate text-sm text-[var(--color-muted)]">
                          {row.services?.name} · {row.staff?.display_name}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-medium tabular-nums">
                          {formatMoney(row.price_cents + row.addons_cents, currency)}
                        </span>
                        <Badge tone={row.status === 'checked_in' ? 'success' : 'neutral'}>
                          {row.status === 'checked_in' ? 'Here' : 'Booked'}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {done.length > 0 && (
          <Card>
            <CardHeader title="Checked out today" />
            <CardBody className="px-0 pb-0">
              <ul className="divide-y divide-[var(--color-border)]">
                {done.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="w-16 shrink-0 tabular-nums text-[var(--color-muted)]">
                      {new Date(row.starts_at).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit', timeZone: timezone,
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {fullName(row.clients?.first_name, row.clients?.last_name)}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--color-muted)]">
                      {formatMoney(row.price_cents + row.addons_cents, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }

  // --- Ring up one appointment -------------------------------------------

  const { data: appointment } = await supabase
    .from('appointments')
    .select(`
      *,
      clients(id, first_name, last_name, client_metrics(*)),
      services(*),
      staff(id, display_name),
      appointment_addons(addon_id, name_snapshot, price_cents)
    `)
    .eq('id', params.appointment)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!appointment) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Checkout</h1>
        <Alert tone="danger">That appointment could not be found.</Alert>
        <Link href="/admin/checkout"><Button>Back</Button></Link>
      </div>
    );
  }

  if (appointment.order_id) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Checkout</h1>
        <Alert tone="warning">
          This {vertical.visitNoun} has already been checked out.
        </Alert>
        <Link href="/admin/checkout"><Button>Back</Button></Link>
      </div>
    );
  }

  const client = appointment.clients as unknown as {
    id: string; first_name: string; last_name: string | null;
    client_metrics: Array<Record<string, number | string | boolean | null>>
      | Record<string, number | string | boolean | null> | null;
  };
  const metricsRaw = client?.client_metrics;
  const metrics = (Array.isArray(metricsRaw) ? metricsRaw[0] : metricsRaw) ?? {};

  const service = appointment.services as unknown as {
    id: string; name: string; price_cents: number; duration_min: number;
    rebook_interval_days: number;
  };
  const staffRow = appointment.staff as unknown as { id: string; display_name: string } | null;
  const existingAddons =
    (appointment.appointment_addons as unknown as Array<{
      addon_id: string; name_snapshot: string; price_cents: number;
    }>) ?? [];

  const [{ data: membership }, { data: addons }, { data: products }] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, credits_balance, membership_plans(name, discount_pct, retail_discount_pct)')
      .eq('client_id', appointment.client_id)
      .in('status', ['active', 'trialing'])
      .maybeSingle(),
    supabase
      .from('service_addons')
      .select('addons(id, name, price_cents, duration_min, active)')
      .eq('service_id', service.id),
    supabase
      .from('products')
      .select('id, name, price_cents')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('sort_order')
      .limit(12),
  ]);

  const plan = membership?.membership_plans as unknown as {
    name: string; discount_pct: number; retail_discount_pct: number;
  } | null;

  const availableAddons = (addons ?? [])
    .map((row) => row.addons as unknown as {
      id: string; name: string; price_cents: number; duration_min: number; active: boolean;
    } | null)
    .filter((a): a is NonNullable<typeof a> => Boolean(a?.active))
    // Anything already on the ticket should not appear as an "add" button.
    .filter((a) => !existingAddons.some((existing) => existing.addon_id === a.id));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Checkout</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {fullName(client.first_name, client.last_name)} ·{' '}
            {new Date(appointment.starts_at).toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit', timeZone: timezone,
            })}
          </p>
        </div>
        <Link href="/admin/checkout">
          <Button variant="ghost" size="sm">Cancel</Button>
        </Link>
      </header>

      <CheckoutTerminal
        appointment={{
          id: appointment.id,
          clientId: appointment.client_id,
          clientName: fullName(client.first_name, client.last_name),
          clientFirstName: client.first_name,
          serviceId: service.id,
          serviceName: service.name,
          servicePriceCents: appointment.price_cents || service.price_cents,
          serviceDurationMin: appointment.duration_min,
          rebookIntervalDays: service.rebook_interval_days,
          staffId: staffRow?.id ?? null,
          staffName: staffRow?.display_name ?? null,
          startsAt: appointment.starts_at,
          depositCents: appointment.deposit_cents,
          depositPaid: Boolean(appointment.deposit_paid_at),
          existingAddons: existingAddons.map((a) => ({
            id: a.addon_id, name: a.name_snapshot, priceCents: a.price_cents,
          })),
          avgDaysBetweenVisits: Number(metrics.avg_days_between_visits) || null,
          completedVisits: Number(metrics.completed_count) || 0,
          membership:
            membership && plan
              ? {
                  id: membership.id,
                  planName: plan.name,
                  creditsBalance: membership.credits_balance,
                  discountPct: plan.discount_pct,
                  retailDiscountPct: plan.retail_discount_pct,
                }
              : null,
          hasFutureBooking: Boolean(metrics.has_future_booking),
          loyaltyPoints: Number(metrics.loyalty_points) || 0,
        }}
        addons={availableAddons.map((a) => ({
          id: a.id, name: a.name, priceCents: a.price_cents, durationMin: a.duration_min,
        }))}
        products={(products ?? []).map((p) => ({
          id: p.id, name: p.name, priceCents: p.price_cents,
        }))}
        tipPresets={rules.upsell.tipPresets}
        currency={currency}
        timezone={timezone}
        visitNoun={vertical.visitNoun}
        clientNoun={vertical.clientNoun}
      />
    </div>
  );
}
