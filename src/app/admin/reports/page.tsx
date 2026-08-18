import { loadMonthlySeries, loadDashboardKpis } from '@/lib/admin/queries';
import { Card, CardHeader, CardBody, Alert, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { TrendChart } from '@/components/admin/TrendChart';

export const metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const [{ series, demo }, { kpis }] = await Promise.all([
    loadMonthlySeries(),
    loadDashboardKpis(),
  ]);

  const latest = series.at(-1);
  const first = series[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Twelve months of the numbers that decide whether this business grows.
        </p>
      </header>

      {demo && <Alert tone="warning" title="Demo data">Connect Supabase for real figures.</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Rebooking rate"
            description="The leading indicator. Everything else follows it."
          />
          <CardBody>
            <TrendChart
              data={series.map((s) => ({ label: s.month, value: s.rebookRate }))}
              format="percent"
              tone="brand"
            />
            {latest && first && (
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                {latest.rebookRate > first.rebookRate ? 'Up' : 'Down'}{' '}
                {Math.abs(latest.rebookRate - first.rebookRate).toFixed(1)} points
                over the period. Each point is roughly{' '}
                {formatMoney(Math.round(latest.revenueCents * 0.01))} a month at
                current volume.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Average ticket"
            description="Moves through add-ons and retail, not price rises."
          />
          <CardBody>
            <TrendChart
              data={series.map((s) => ({ label: s.month, value: s.avgTicketCents / 100 }))}
              format="currency"
              tone="accent"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="neutral">
                Add-on attach {kpis.addonAttachRate ?? '—'}%
              </Badge>
              <Badge tone="neutral">
                Retail attach {kpis.retailAttachRate ?? '—'}%
              </Badge>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="No-show rate"
            description="Lower is better. Deposits and confirmations are the levers."
          />
          <CardBody>
            <TrendChart
              data={series.map((s) => ({ label: s.month, value: s.noShowRate }))}
              format="percent"
              tone="danger"
              invert
            />
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              {formatMoney(kpis.lostRevenueCents)} of booked revenue did not show
              this month;{' '}
              {formatMoney(kpis.recoveredFeeCents)} was recovered in fees.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Membership movement"
            description="New versus churned. Net is what compounds."
          />
          <CardBody>
            <TrendChart
              data={series.map((s) => ({
                label: s.month,
                value: s.newMembers - s.churnedMembers,
              }))}
              format="number"
              tone="success"
            />
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              {kpis.activeMembers} active members ·{' '}
              {formatMoney(kpis.mrrCents)} MRR
              {kpis.atRiskMrrCents > 0 && (
                <> · <span className="text-[var(--color-warning)]">
                  {formatMoney(kpis.atRiskMrrCents)} cancelling
                </span></>
              )}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Monthly detail" />
        <CardBody className="px-0 pb-0">
          <div className="scroll-x">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="border-y border-[var(--color-border)] bg-[var(--color-surface-2)] text-left">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">Month</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Visits</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Avg ticket</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Rebook</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">No-show</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Members</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[...series].reverse().map((row) => (
                  <tr key={row.month}>
                    <td className="px-5 py-2.5">{row.month}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(row.revenueCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.completedVisits}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(row.avgTicketCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.rebookRate.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.noShowRate.toFixed(1)}%
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {row.activeMembers}
                      <span className="ml-1 text-xs text-[var(--color-muted)]">
                        (+{row.newMembers}/−{row.churnedMembers})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
