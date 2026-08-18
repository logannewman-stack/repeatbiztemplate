import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { isSupabaseConfigured } from '@/lib/demo';
import { messagingStatus } from '@/lib/messaging';
import { rules } from '@/config/rules';
import { Card, CardHeader, CardBody, Badge, Alert } from '@/components/ui';
import { formatMoney } from '@/lib/utils';

export const metadata = { title: 'Campaigns' };

interface CampaignRow {
  key: string;
  name: string;
  description: string;
  trigger: string;
  channel: string;
  active: boolean;
  sent: number;
  converted: number;
  revenueCents: number;
}

const DEMO_CAMPAIGNS: CampaignRow[] = [
  { key: 'confirm_booking', name: 'Booking confirmation', description: 'Sent the moment a booking is made.', trigger: 'appointment_booked', channel: 'sms', active: true, sent: 430, converted: 0, revenueCents: 0 },
  { key: 'reminder_24h', name: '24-hour reminder', description: 'The confirmation ask. Confirmed appointments no-show far less.', trigger: 'appointment_reminder', channel: 'sms', active: true, sent: 412, converted: 0, revenueCents: 0 },
  { key: 'first_visit_followup', name: 'First-visit follow-up', description: 'Second visits are where retention is won or lost.', trigger: 'first_visit_followup', channel: 'email', active: true, sent: 118, converted: 41, revenueCents: 512_00 },
  { key: 'rebook_due', name: 'Rebooking nudge — due', description: 'Fires the day the client hits their personal interval.', trigger: 'rebooking_nudge', channel: 'sms', active: true, sent: 96, converted: 34, revenueCents: 438_00 },
  { key: 'rebook_overdue_5', name: 'Rebooking nudge — 5 days late', description: 'Second touch, different channel.', trigger: 'rebooking_nudge', channel: 'email', active: true, sent: 62, converted: 14, revenueCents: 187_00 },
  { key: 'winback_30', name: 'Winback — 30 days lapsed', description: 'First paid offer.', trigger: 'lapse_winback', channel: 'email', active: true, sent: 71, converted: 9, revenueCents: 121_00 },
  { key: 'winback_90', name: 'Winback — 90 days lapsed', description: 'Best offer. Past this point most clients are gone.', trigger: 'lapse_winback', channel: 'email', active: true, sent: 48, converted: 3, revenueCents: 38_00 },
  { key: 'review_request', name: 'Review request', description: 'Rating-gated so unhappy clients reach the owner, not the public listing.', trigger: 'review_request', channel: 'sms', active: true, sent: 204, converted: 0, revenueCents: 0 },
  { key: 'no_show_followup', name: 'No-show follow-up', description: 'Recovers a meaningful share if it goes out same day.', trigger: 'no_show_followup', channel: 'sms', active: true, sent: 22, converted: 7, revenueCents: 89_00 },
];

export default async function CampaignsPage() {
  const messaging = messagingStatus();
  let campaigns = DEMO_CAMPAIGNS;
  let demo = true;

  if (isSupabaseConfigured()) {
    const business = await loadBusiness();
    if (business) {
      const supabase = createAdminClient();
      const [{ data: rows }, { data: perf }] = await Promise.all([
        supabase.from('campaigns').select('*').eq('business_id', business.id).order('trigger_type'),
        supabase.from('v_campaign_performance').select('*').eq('business_id', business.id),
      ]);

      const byId = new Map<string, { sent: number; converted: number; revenue: number }>();
      for (const p of perf ?? []) {
        if (!p.campaign_id) continue;
        const acc = byId.get(p.campaign_id) ?? { sent: 0, converted: 0, revenue: 0 };
        acc.sent += Number(p.sent ?? 0);
        acc.converted += Number(p.converted ?? 0);
        acc.revenue += Number(p.revenue_cents ?? 0);
        byId.set(p.campaign_id, acc);
      }

      campaigns = (rows ?? []).map((c) => {
        const stats = byId.get(c.id) ?? { sent: 0, converted: 0, revenue: 0 };
        return {
          key: c.key, name: c.name, description: c.description ?? '',
          trigger: c.trigger_type, channel: c.channel, active: c.active,
          sent: stats.sent, converted: stats.converted, revenueCents: stats.revenue,
        };
      });
      demo = false;
    }
  }

  const totalRevenue = campaigns.reduce((sum, c) => sum + c.revenueCents, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Every automated message, and what it actually earned.
        </p>
      </header>

      {(messaging.email === 'simulated' || messaging.sms === 'simulated') && (
        <Alert tone="warning" title="Messages are being simulated">
          <p className="mt-1">
            {messaging.email === 'simulated' && 'Email has no provider configured. '}
            {messaging.sms === 'simulated' && 'SMS has no provider configured. '}
            Sends are recorded and dashboards populate, but nothing leaves the
            server. Add <code>RESEND_API_KEY</code> and the Twilio variables to go
            live — see <code>SETUP.md</code> step 4.
          </p>
        </Alert>
      )}

      {demo && <Alert tone="warning" title="Demo data">Connect Supabase for real figures.</Alert>}

      <Card>
        <CardHeader
          title="Attributed revenue"
          description="A booking made within 48 hours of a send is credited to it."
          action={
            <span className="text-2xl font-semibold tabular-nums">
              {formatMoney(totalRevenue)}
            </span>
          }
        />
        <CardBody className="px-0 pb-0">
          <div className="scroll-x">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="border-y border-[var(--color-border)] bg-[var(--color-surface-2)] text-left">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">Campaign</th>
                  <th scope="col" className="px-3 py-2 font-medium">Channel</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Sent</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Booked</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Rate</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {campaigns.map((c) => (
                  <tr key={c.key}>
                    <td className="px-5 py-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-[var(--color-muted)]">{c.description}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone="neutral">{c.channel}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.sent}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {c.converted || '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {c.sent > 0 && c.converted > 0
                        ? `${((c.converted / c.sent) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {c.revenueCents > 0 ? formatMoney(c.revenueCents) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={c.active ? 'success' : 'neutral'}>
                        {c.active ? 'On' : 'Off'}
                      </Badge>
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
            title="Guardrails"
            description="What stops automation from becoming harassment."
          />
          <CardBody>
            <ul className="space-y-3 text-sm text-[var(--color-muted)]">
              <li>
                <strong className="text-[var(--color-fg)]">Never chase a client
                who already rebooked.</strong> Nothing sours a good client faster.
                Every nudge campaign skips anyone with a future booking.
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">One message per
                20 hours,</strong> across all campaigns, so three automations
                firing the same day do not stack.
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">Quiet hours{' '}
                {rules.reminders.quietHours.start}–{rules.reminders.quietHours.end}.</strong>{' '}
                Marketing sends defer to the morning rather than being dropped.
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">Transactional
                messages bypass marketing consent</strong> — confirmations,
                reminders, and billing notices always go out.
              </li>
              <li>
                <strong className="text-[var(--color-fg)]">Every skip is
                logged with its reason,</strong> so &quot;why didn&apos;t my client get
                the reminder?&quot; has a real answer.
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Reading this table"
            description="Not every campaign is supposed to earn revenue."
          />
          <CardBody className="space-y-3 text-sm text-[var(--color-muted)]">
            <p>
              Confirmations and reminders show no attributed revenue because they
              are not meant to produce bookings — they protect bookings you already
              have. Judge them by the no-show rate on the Reports page instead.
            </p>
            <p>
              The rebooking nudges and winbacks are the ones to hold to a revenue
              number. If a winback tier stops paying for its offers, lower the
              offer before switching the campaign off — the message is rarely
              the problem.
            </p>
            <p>
              Attribution is deliberately conservative: a 48-hour window, and only
              the most recent unconverted send gets the credit. Real lift is
              somewhat higher than what this table shows.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
