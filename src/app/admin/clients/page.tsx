import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { isSupabaseConfigured } from '@/lib/demo';
import { vertical } from '@/config/verticals';
import { Card, CardHeader, CardBody, Badge, Alert, EmptyState, Input } from '@/components/ui';
import { formatMoney, fullName, formatPhone } from '@/lib/utils';

export const metadata = { title: 'Clients' };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segment?: string }>;
}) {
  const { q, segment } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">{titleCase(vertical.clientNounPlural)}</h1>
        </header>
        <Alert tone="warning" title="Demo mode">
          The client list reads from live data only. Connect Supabase and import a
          client list to use this page — see <code>SETUP.md</code>.
        </Alert>
      </div>
    );
  }

  const business = await loadBusiness();
  if (!business) return <Alert tone="danger">Business not configured.</Alert>;

  const supabase = createAdminClient();
  let query = supabase
    .from('clients')
    .select('*, client_metrics(*)')
    .eq('business_id', business.id)
    .is('archived_at', null)
    .limit(100);

  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
    );
  }

  const { data: clients } = await query;

  const rows = (clients ?? [])
    .map((c) => {
      const m = c.client_metrics as unknown as Record<string, unknown> | Array<Record<string, unknown>> | null;
      const metrics = (Array.isArray(m) ? m[0] : m) ?? {};
      return { client: c, metrics: metrics as Record<string, number | string | null> };
    })
    .filter((row) => !segment || row.metrics.lifecycle === segment)
    .sort(
      (a, b) =>
        Number(b.metrics.lifetime_value_cents ?? 0) -
        Number(a.metrics.lifetime_value_cents ?? 0)
    );

  const SEGMENTS = ['vip', 'active', 'due', 'at_risk', 'lapsed', 'new', 'lead'];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{titleCase(vertical.clientNounPlural)}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Sorted by lifetime value. The top of this list is the business.
        </p>
      </header>

      <form className="flex flex-wrap gap-2" action="/admin/clients">
        <Input
          name="q" defaultValue={q ?? ''} placeholder="Search name, email, or phone"
          className="max-w-sm"
        />
        {segment && <input type="hidden" name="segment" value={segment} />}
      </form>

      <div className="scroll-x flex gap-2">
        <SegmentChip label="All" href="/admin/clients" active={!segment} />
        {SEGMENTS.map((s) => (
          <SegmentChip
            key={s}
            label={labelFor(s)}
            href={`/admin/clients?segment=${s}`}
            active={segment === s}
          />
        ))}
      </div>

      <Card>
        <CardBody className="px-0 py-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No clients found"
                description={q ? `Nothing matched "${q}".` : 'Import a client list from Settings.'}
              />
            </div>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th scope="col" className="px-5 py-2 font-medium">Name</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Visits</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Avg ticket</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Lifetime</th>
                    <th scope="col" className="px-3 py-2 font-medium">Next visit</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(({ client, metrics }) => (
                    <tr key={client.id}>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="font-medium hover:underline"
                        >
                          {fullName(client.first_name, client.last_name)}
                        </Link>
                        <p className="text-xs text-[var(--color-muted)]">
                          {client.email ?? formatPhone(client.phone)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={toneFor(String(metrics.lifecycle ?? 'lead'))}>
                          {labelFor(String(metrics.lifecycle ?? 'lead'))}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {Number(metrics.completed_count ?? 0)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatMoney(Number(metrics.avg_ticket_cents ?? 0))}
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">
                        {formatMoney(Number(metrics.lifetime_value_cents ?? 0))}
                      </td>
                      <td className="px-3 py-3 text-[var(--color-muted)]">
                        {metrics.next_appointment_at
                          ? new Date(String(metrics.next_appointment_at)).toLocaleDateString()
                          : <span className="text-[var(--color-warning)]">None booked</span>}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {Number(metrics.churn_risk ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SegmentChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        'whitespace-nowrap rounded-full px-3 py-1.5 text-sm ' +
        (active
          ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]'
          : 'bg-[var(--color-surface-2)] text-[var(--color-muted)]')
      }
    >
      {label}
    </Link>
  );
}

function labelFor(lifecycle: string): string {
  return {
    lead: 'Lead', new: 'New', active: 'Active', due: 'Due',
    at_risk: 'At risk', lapsed: 'Lapsed', recovered: 'Recovered', vip: 'VIP',
  }[lifecycle] ?? lifecycle;
}

function toneFor(lifecycle: string): 'neutral' | 'brand' | 'success' | 'warning' | 'danger' {
  return ({
    lead: 'neutral', new: 'brand', active: 'success', due: 'warning',
    at_risk: 'warning', lapsed: 'danger', recovered: 'success', vip: 'brand',
  } as const)[lifecycle] ?? 'neutral';
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
