import Link from 'next/link';
import { brand } from '@/config/brand';
import { vertical } from '@/config/verticals';
import { rules } from '@/config/rules';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Card, Badge, Button, Alert } from '@/components/ui';
import { demoPlans, demoServices } from '@/lib/demo';
import { formatMoney } from '@/lib/utils';

export const metadata = {
  title: `${brand.copy.membershipName}s`,
  description: brand.copy.membershipPitch,
};

export default function MembershipsPage() {
  const plans = demoPlans();
  const services = demoServices();
  const typicalPrice = services[0]?.price_cents ?? 8500;

  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="text-3xl font-bold md:text-4xl">
            {brand.copy.membershipName}s
          </h1>
          <p className="mx-auto mt-3 max-w-prose text-lg text-[var(--color-muted)]">
            {brand.copy.membershipPitch}
          </p>
        </section>

        <section className="mx-auto grid max-w-4xl gap-4 px-4 md:grid-cols-2">
          {plans.map((plan, i) => {
            // The comparison that sells: what the same visits cost à la carte.
            const alaCarte = plan.included_credits * typicalPrice;
            const saves = alaCarte - plan.price_cents;

            return (
              <Card
                key={plan.id}
                className={i === 1 ? 'border-2 border-[var(--color-brand)] p-6' : 'p-6'}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  {i === 1 && <Badge tone="brand">Most popular</Badge>}
                </div>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{plan.pitch}</p>

                <p className="mt-5">
                  <span className="text-4xl font-bold tabular-nums">
                    {formatMoney(plan.price_cents)}
                  </span>
                  <span className="text-[var(--color-muted)]">
                    /{plan.billing_interval}
                  </span>
                </p>

                {saves > 0 && (
                  <p className="mt-1 text-sm text-[var(--color-success)]">
                    Saves about {formatMoney(saves)} a month versus paying per visit
                  </p>
                )}

                <ul className="mt-5 space-y-2 text-sm">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <span aria-hidden className="text-[var(--color-success)]">✓</span>
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>

                <Link href={`/book?plan=${plan.slug}`} className="mt-6 block">
                  <Button fullWidth size="lg" variant={i === 1 ? 'primary' : 'secondary'}>
                    Join {plan.name}
                  </Button>
                </Link>
              </Card>
            );
          })}
        </section>

        <section className="mx-auto mt-10 max-w-4xl space-y-4 px-4">
          <h2 className="text-xl font-semibold">Common questions</h2>

          <Faq q="Can I cancel any time?">
            {rules.memberships.commitmentMonths > 0
              ? `There's a ${rules.memberships.commitmentMonths}-month minimum, after which you can cancel any time.`
              : 'Yes. There is no minimum term and no cancellation fee.'}{' '}
            {rules.memberships.allowPause &&
              `You can also pause for up to ${rules.memberships.maxPauseMonths} months instead, ${rules.memberships.pausesPerYear} times a year, which keeps your rate and your banked credits.`}
          </Faq>

          <Faq q="What if I don't use my visit one month?">
            {rules.memberships.creditRolloverPeriods > 0
              ? `Unused visits roll over for ${rules.memberships.creditRolloverPeriods} months, up to ${rules.memberships.maxBankedCredits} banked at once. We'll remind you before any expire.`
              : 'Included visits are use-it-or-lose-it each month.'}
          </Faq>

          <Faq q="Can I use my membership on any service?">
            Your included {vertical.visitNounPlural} apply to the services listed on
            your plan. Your member discount applies to everything else, including
            add-ons and retail.
          </Faq>

          <Faq q="Do I still need to pay a deposit?">
            No. Members skip deposits entirely, on every booking.
          </Faq>

          <Faq q="What happens if my card fails?">
            We&apos;ll email you and retry over the following week. Your benefits stay
            active for {rules.memberships.dunning.graceDays} days, and nothing is
            cancelled without warning.
          </Faq>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-10">
          <Alert tone="neutral">
            <p>
              <strong>Template note:</strong> membership terms are placeholders
              configured in <code>src/config/rules.ts</code>. Have a real
              client&apos;s terms reviewed before launch — recurring billing is
              regulated in most jurisdictions.
            </p>
          </Alert>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <summary className="cursor-pointer font-medium">{q}</summary>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{children}</p>
    </details>
  );
}
