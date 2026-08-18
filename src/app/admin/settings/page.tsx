import { brand } from '@/config/brand';
import { vertical, verticals } from '@/config/verticals';
import { rules } from '@/config/rules';
import { messagingStatus } from '@/lib/messaging';
import { isStripeConfigured } from '@/lib/stripe/client';
import { isSupabaseConfigured } from '@/lib/demo';
import { Card, CardHeader, CardBody, Badge, Alert } from '@/components/ui';
import { formatMoney } from '@/lib/utils';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  const messaging = messagingStatus();

  const integrations = [
    {
      name: 'Supabase',
      ready: isSupabaseConfigured(),
      detail: 'Database, auth, and file storage',
      env: 'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
      blocks: 'Everything except the demo catalog',
    },
    {
      name: 'Stripe',
      ready: isStripeConfigured(),
      detail: 'Deposits, memberships, packages, gift cards',
      env: 'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET',
      blocks: 'Payments and recurring revenue',
    },
    {
      name: 'Email (Resend)',
      ready: messaging.email === 'configured',
      detail: 'Confirmations, follow-ups, winbacks',
      env: 'RESEND_API_KEY, EMAIL_FROM',
      blocks: 'Email delivery — sends are logged instead',
    },
    {
      name: 'SMS (Twilio)',
      ready: messaging.sms === 'configured',
      detail: 'Reminders and rebooking nudges',
      env: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID',
      blocks: 'SMS delivery — sends are logged instead',
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          What this build is configured as, and what is still wired to placeholders.
        </p>
      </header>

      {/* The two screens that actually change things live elsewhere; this page
          is a status report. Point at them rather than duplicating them. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <a href="/admin/setup" className="block">
          <Card className="h-full p-4 transition-colors hover:border-[var(--color-brand)]">
            <p className="font-medium">Setup</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Business name, logo, colors, service menu, team, and opening hours.
              Changes go live immediately.
            </p>
          </Card>
        </a>
        <a href="/admin/settings/policies" className="block">
          <Card className="h-full p-4 transition-colors hover:border-[var(--color-brand)]">
            <p className="font-medium">Policies</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Cancellation windows, deposits, reminders, rebooking cadence, and
              membership terms — without a redeploy.
            </p>
          </Card>
        </a>
      </div>

      <Card>
        <CardHeader
          title="Integrations"
          description="Nothing here fails loudly — an unconfigured service degrades to a safe no-op."
        />
        <CardBody className="px-0 pb-0">
          <ul className="divide-y divide-[var(--color-border)]">
            {integrations.map((item) => (
              <li key={item.name} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{item.name}</p>
                    <Badge tone={item.ready ? 'success' : 'warning'}>
                      {item.ready ? 'Connected' : 'Not configured'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">{item.detail}</p>
                  {!item.ready && (
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Set <code>{item.env}</code> · Without it: {item.blocks}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Brand"
            description="Edit src/config/brand.ts, then redeploy."
          />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <Row label="Business name" value={brand.name} />
              <Row label="Vertical" value={`${vertical.label} (${brand.vertical})`} />
              <Row label="Slug" value={brand.slug} />
              <Row label="Phone" value={brand.contact.phone} />
              <Row label="Email" value={brand.contact.email} />
              <Row label="Vocabulary" value={
                `${vertical.clientNoun} / ${vertical.providerNoun} / ${vertical.visitNoun}`
              } />
            </dl>
            <Alert tone="neutral">
              <p>
                Switching <code>vertical</code> in <code>brand.ts</code> to one of{' '}
                {Object.keys(verticals).length} presets re-skins the vocabulary,
                default services, add-ons, membership shapes, and rebooking
                cadences across the whole app.
              </p>
            </Alert>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Policies"
            description="Edit src/config/rules.ts, or override per-business in businesses.policy."
          />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <Row
                label="Free cancellation"
                value={`${rules.cancellation.freeCancellationHours} hours before`}
              />
              <Row
                label="Late fees"
                value={rules.cancellation.feeTiers
                  .map((t) => `${t.feePercent}% under ${t.withinHours}h`)
                  .join(', ')}
              />
              <Row
                label="No-show fee"
                value={`${rules.cancellation.noShowFeePercent}% of service`}
              />
              <Row
                label="Deposits"
                value={
                  rules.deposits.enabled
                    ? `${rules.deposits.defaultPercent}% above ${formatMoney(rules.deposits.requireAboveCents)} or ${rules.deposits.requireAboveMinutes} min`
                    : 'Disabled'
                }
              />
              <Row
                label="Reminders"
                value={rules.reminders.scheduleHoursBefore.map((h) => `${h}h`).join(', ')}
              />
              <Row
                label="Rebooking nudges"
                value={rules.rebooking.nudgeDayOffsets.map((d) => `day ${d}`).join(', ')}
              />
              <Row
                label="Lapse threshold"
                value={`${rules.lapse.lapseMultiplier}× personal cadence`}
              />
              <Row
                label="Membership pause"
                value={
                  rules.memberships.allowPause
                    ? `Up to ${rules.memberships.maxPauseMonths} months, ${rules.memberships.pausesPerYear}× per year`
                    : 'Not allowed'
                }
              />
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Before launching a client build"
          description="The placeholder content that must be replaced."
        />
        <CardBody>
          <ul className="space-y-2 text-sm text-[var(--color-muted)]">
            <li>
              <strong className="text-[var(--color-fg)]">Brand and copy</strong> —
              upload the real logo, icon, and hero photo in{' '}
              <a href="/admin/setup" className="underline">Setup</a>. The
              placeholders in <code>src/config/brand.ts</code> are only the
              fallback for a fresh fork.
            </li>
            <li>
              <strong className="text-[var(--color-fg)]">Legal pages</strong> — the
              policies page, consent forms, and privacy notice all ship as
              placeholders and must be reviewed by the client&apos;s own counsel,
              particularly for medical or med-spa builds.
            </li>
            <li>
              <strong className="text-[var(--color-fg)]">Review link</strong> —
              still a placeholder domain, so happy clients are being sent
              nowhere. Set it in{' '}
              <a href="/admin/settings/policies" className="underline">Policies</a>.
            </li>
            <li>
              <strong className="text-[var(--color-fg)]">Message templates</strong> —
              the seeded copy is deliberately plain. Rewrite it in the client&apos;s
              voice before sending anything.
            </li>
            <li>
              <strong className="text-[var(--color-fg)]">SMS compliance</strong> —
              register a Twilio A2P 10DLC campaign before sending marketing texts
              in the US, and keep the opt-out language in every marketing template.
            </li>
            <li>
              <strong className="text-[var(--color-fg)]">Seed data</strong> — run
              the catalog seed for the right vertical, then remove the demo clients
              from <code>supabase/demo-history.sql</code> if they were loaded.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
