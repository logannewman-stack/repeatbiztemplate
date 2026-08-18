import { loadDueClients } from '@/lib/admin/queries';
import { vertical } from '@/config/verticals';
import { rules } from '@/config/rules';
import { Card, CardHeader, CardBody, Badge, Alert, EmptyState } from '@/components/ui';
import { formatMoney, fullName, formatPhone } from '@/lib/utils';
import { RetentionActions } from '@/components/admin/RetentionActions';

export const metadata = { title: 'Retention' };

export default async function RetentionPage() {
  const { clients, demo } = await loadDueClients(100);

  const buckets = {
    due: clients.filter((c) => c.lifecycle === 'due'),
    atRisk: clients.filter((c) => c.lifecycle === 'at_risk'),
    lapsed: clients.filter((c) => c.lifecycle === 'lapsed'),
  };

  const totalAtStake = clients.reduce((sum, c) => sum + c.priorityScore, 0);
  const uncontacted = clients.filter((c) => !c.lastContactedAt);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Retention</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Every {vertical.clientNoun} past their usual interval without a next
          visit booked, ranked by what winning them back is worth.
        </p>
      </header>

      {demo && (
        <Alert tone="warning" title="Demo data">
          Connect Supabase to work your real list.
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="At stake" value={formatMoney(totalAtStake)} hint="Expected value across this list" />
        <SummaryCard label="Due" value={String(buckets.due.length)} hint="Easiest to recover" />
        <SummaryCard label="At risk" value={String(buckets.atRisk.length)} hint="Drifting past cadence" />
        <SummaryCard label="Lapsed" value={String(buckets.lapsed.length)} hint="Needs an offer" />
      </section>

      {uncontacted.length > 0 && (
        <Alert tone="brand" title={`${uncontacted.length} have not been contacted yet`}>
          <p className="mt-1">
            The automations pick these up on their own schedule. Calling the top of
            this list is what closes the gap automation misses — a call from a real
            person converts several times better than a text.
          </p>
        </Alert>
      )}

      <Card>
        <CardHeader
          title="The list"
          description="Work down from the top. The order is already the right order."
        />
        <CardBody className="px-0 pb-0">
          {clients.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState
                title="Nobody is overdue"
                description={`Every ${vertical.clientNoun} with history has their next ${vertical.visitNoun} booked. This is what good looks like.`}
              />
            </div>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="border-y border-[var(--color-border)] bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th scope="col" className="px-5 py-2 font-medium">Client</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 font-medium">Last visit</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Avg ticket</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Lifetime</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">At stake</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {clients.map((client) => (
                    <tr key={client.clientId}>
                      <td className="px-5 py-3">
                        <p className="font-medium">
                          {fullName(client.firstName, client.lastName)}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {formatPhone(client.phone)} · {client.visitCount} visits
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <RiskBadge lifecycle={client.lifecycle} risk={client.churnRisk} />
                          {client.lastContactedAt && (
                            <span className="text-xs text-[var(--color-muted)]">
                              Auto-contacted
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[var(--color-muted)]">
                        {client.daysSinceVisit != null ? `${client.daysSinceVisit}d ago` : '—'}
                        {client.daysOverdue != null && client.daysOverdue > 0 && (
                          <span className="block text-xs text-[var(--color-warning)]">
                            {client.daysOverdue}d overdue
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatMoney(client.avgTicketCents)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[var(--color-muted)]">
                        {formatMoney(client.lifetimeValueCents)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">
                        {formatMoney(client.priorityScore)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <RetentionActions
                          clientId={client.clientId}
                          phone={client.phone}
                          lifecycle={client.lifecycle}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="How this list is built"
          description="No black boxes — you should be able to explain any row to the client on it."
        />
        <CardBody className="space-y-3 text-sm text-[var(--color-muted)]">
          <p>
            <strong className="text-[var(--color-fg)]">Cadence.</strong> After two
            visits we use the {vertical.clientNoun}&apos;s own average gap rather than
            the interval on the service. Someone who reliably returns every five
            weeks for a six-week service is due at five.
          </p>
          <p>
            <strong className="text-[var(--color-fg)]">Lapsed.</strong> Past{' '}
            {rules.lapse.lapseMultiplier}× their normal interval. Winback offers
            escalate at {rules.lapse.winbackOffers.map((o) => `${o.afterDays}d`).join(', ')}{' '}
            and stop entirely after {rules.lapse.giveUpAfterDays} days — past that,
            chasing costs more than it returns.
          </p>
          <p>
            <strong className="text-[var(--color-fg)]">At stake.</strong> Average
            ticket × churn risk. Ranking by expected value puts a valuable client who
            is slightly late above a low spender who is very late, which is the order
            you should actually call in.
          </p>
          <p>
            <strong className="text-[var(--color-fg)]">Nobody appears here</strong>{' '}
            once they have a future {vertical.visitNoun} on the books, however overdue
            they were.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>
    </Card>
  );
}

function RiskBadge({ lifecycle, risk }: { lifecycle: string; risk: number }) {
  const tone =
    lifecycle === 'lapsed' ? 'danger' : lifecycle === 'at_risk' ? 'warning' : 'brand';
  const label =
    lifecycle === 'lapsed' ? 'Lapsed' : lifecycle === 'at_risk' ? 'At risk' : 'Due';
  return <Badge tone={tone as 'danger' | 'warning' | 'brand'}>{label} · {risk}</Badge>;
}
