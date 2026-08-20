import Link from 'next/link';
import { loadDashboardKpis, loadDueClients } from '@/lib/admin/queries';
import { vertical } from '@/config/verticals';
import {
  Alert, Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState,
} from '@/components/ui';
import { formatMoney, fullName, relativeDays } from '@/lib/utils';

export default async function AdminDashboard() {
  const [{ kpis, demo }, { clients }] = await Promise.all([
    loadDashboardKpis(),
    loadDueClients(6),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          The four numbers this platform exists to move.
        </p>
      </header>

      {demo && (
        <Alert tone="warning" title="Demo data">
          Supabase is not connected, so these figures are illustrative. See{' '}
          <code>SETUP.md</code> to connect a project.
        </Alert>
      )}

      {/* --- The four headline numbers ---------------------------------- */}
      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Monthly recurring revenue"
          value={formatMoney(kpis.mrrCents)}
          delta={kpis.mrrDeltaPct}
          footnote={`${kpis.activeMembers} active members`}
          warning={
            kpis.atRiskMrrCents > 0
              ? `${formatMoney(kpis.atRiskMrrCents)} cancelling at period end`
              : null
          }
          href="/admin/memberships"
        />
        <KpiCard
          label="Rebooking rate"
          value={kpis.rebookRate != null ? `${kpis.rebookRate}%` : '—'}
          delta={kpis.rebookRateDeltaPct}
          footnote={`of ${kpis.completedVisits} completed ${vertical.visitNounPlural}`}
          warning={
            kpis.rebookRate != null && kpis.rebookRate < 40
              ? 'Below 40% — the biggest lever you have'
              : null
          }
          href="/admin/retention"
        />
        <KpiCard
          label="No-show + cancel rate"
          value={
            kpis.noShowRate != null && kpis.cancellationRate != null
              ? `${(kpis.noShowRate + kpis.cancellationRate).toFixed(1)}%`
              : '—'
          }
          footnote={`${formatMoney(kpis.lostRevenueCents)} of revenue lost`}
          warning={
            kpis.recoveredFeeCents > 0
              ? `${formatMoney(kpis.recoveredFeeCents)} recovered in fees`
              : null
          }
          invertDelta
          href="/admin/reports"
        />
        <KpiCard
          label="Average ticket"
          value={kpis.avgTicketCents != null ? formatMoney(kpis.avgTicketCents) : '—'}
          delta={kpis.avgTicketDeltaPct}
          footnote={
            kpis.addonAttachRate != null
              ? `${kpis.addonAttachRate}% attach an add-on`
              : undefined
          }
          href="/admin/reports"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* --- Retention queue ------------------------------------------ */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Who to call today"
            description="Ranked by what winning them back is worth, not by how late they are."
            action={
              <ButtonLink
                href="/admin/retention"
                size="sm"
                variant="secondary"
              >
                See all
              </ButtonLink>
            }
          />
          <CardBody>
            {clients.length === 0 ? (
              <EmptyState
                title="Nobody is overdue"
                description="Every client with history has their next visit booked."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {clients.map((client) => (
                  <li key={client.clientId} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">
                          {fullName(client.firstName, client.lastName)}
                        </p>
                        <LifecycleBadge lifecycle={client.lifecycle} />
                        {client.lastContactedAt && (
                          <Badge tone="neutral">Contacted</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                        {client.daysOverdue != null && client.daysOverdue > 0
                          ? `${client.daysOverdue} days overdue`
                          : 'Due now'}
                        {' · '}
                        {client.visitCount} visits
                        {' · '}
                        {formatMoney(client.avgTicketCents)} avg
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(client.priorityScore)}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">at stake</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* --- Client health -------------------------------------------- */}
        <Card>
          <CardHeader
            title="Client health"
            description="Where your book actually stands."
          />
          <CardBody className="space-y-3">
            <HealthRow
              label="Due for a visit" count={kpis.clientsDue} tone="warning"
              hint="Past their usual interval, still very recoverable"
            />
            <HealthRow
              label="At risk" count={kpis.clientsAtRisk} tone="warning"
              hint="Drifting well past cadence"
            />
            <HealthRow
              label="Lapsed" count={kpis.clientsLapsed} tone="danger"
              hint="Winback campaigns are working these"
            />
            <HealthRow
              label="Members past due" count={kpis.pastDueMembers} tone="danger"
              hint="Failed payment — dunning in progress"
            />

            <div className="pt-2">
              <ButtonLink href="/admin/campaigns" size="sm" variant="secondary" fullWidth>
                Review automations
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* --- What to do about it --------------------------------------- */}
      <Card>
        <CardHeader
          title="Where the money is"
          description="Ordered by how much each lever is worth right now."
        />
        <CardBody>
          <ol className="space-y-3">
            <Lever
              n={1}
              title="Rebook at the chair, not by text"
              detail={
                kpis.rebookRate != null
                  ? `You are at ${kpis.rebookRate}%. Every 10 points here is worth roughly ` +
                    `${formatMoney(Math.round((kpis.revenueCents * 0.1)))} a month at your current volume.`
                  : 'Prompt for the next visit before the client leaves.'
              }
              href="/admin/retention"
            />
            <Lever
              n={2}
              title="Convert your top spenders to members"
              detail={`${kpis.activeMembers} members today. Clients whose 90-day spend already exceeds a plan price are the easiest sale you have.`}
              href="/admin/memberships"
            />
            <Lever
              n={3}
              title="Cut the no-shows you are paying for"
              detail={`${formatMoney(kpis.lostRevenueCents)} walked out this month. Deposits on high-value and high-risk bookings recover most of it.`}
              href="/admin/settings/policies"
            />
            <Lever
              n={4}
              title="Attach one more thing to each ticket"
              detail={
                kpis.addonAttachRate != null
                  ? `${kpis.addonAttachRate}% of tickets include an add-on and ${kpis.retailAttachRate}% include retail. Both respond to being asked.`
                  : 'Add-ons and retail move average ticket faster than raising prices.'
              }
              href="/admin/reports"
            />
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}

// --- Sub-components ---------------------------------------------------------

function KpiCard({
  label, value, delta, footnote, warning, href, invertDelta,
}: {
  label: string;
  value: string;
  delta?: number | null;
  footnote?: string;
  warning?: string | null;
  href: string;
  invertDelta?: boolean;
}) {
  // For no-shows, down is good — the arrow has to mean "better", not "bigger".
  const tone =
    delta == null ? null
    : (invertDelta ? -delta : delta) > 0 ? 'success'
    : (invertDelta ? -delta : delta) < 0 ? 'danger'
    : 'neutral';

  return (
    <Link href={href} className="block">
      <Card className="h-full p-4 transition-colors hover:border-[var(--color-brand)]">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          {label}
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {tone && (
            <Badge tone={tone}>
              {delta! > 0 ? '+' : ''}{delta}%
            </Badge>
          )}
        </div>
        {footnote && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">{footnote}</p>
        )}
        {warning && (
          <p className="mt-2 text-xs text-[var(--color-warning)]">{warning}</p>
        )}
      </Card>
    </Link>
  );
}

function LifecycleBadge({ lifecycle }: { lifecycle: string }) {
  const map: Record<string, { tone: 'neutral' | 'success' | 'warning' | 'danger' | 'brand'; label: string }> = {
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
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

function HealthRow({
  label, count, tone, hint,
}: {
  label: string;
  count: number;
  tone: 'warning' | 'danger';
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      </div>
      <Badge tone={count > 0 ? tone : 'neutral'}>{count}</Badge>
    </div>
  );
}

function Lever({
  n, title, detail, href,
}: {
  n: number;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-xs font-semibold text-[var(--color-brand)]"
      >
        {n}
      </span>
      <div className="min-w-0">
        <Link href={href} className="font-medium hover:underline">{title}</Link>
        <p className="mt-0.5 text-sm text-[var(--color-muted)]">{detail}</p>
      </div>
    </li>
  );
}
