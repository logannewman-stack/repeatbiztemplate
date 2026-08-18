import Link from 'next/link';
import { brand } from '@/config/brand';
import { vertical } from '@/config/verticals';
import { rules } from '@/config/rules';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Button, Card, Badge, Alert } from '@/components/ui';
import { demoServices, demoCategories, demoStaff, demoPlans, isSupabaseConfigured } from '@/lib/demo';
import { formatMoney, formatDuration } from '@/lib/utils';

export default function HomePage() {
  const services = demoServices();
  const categories = demoCategories();
  const staff = demoStaff();
  const plans = demoPlans();
  const configured = isSupabaseConfigured();

  return (
    <>
      <SiteHeader />

      <main id="main">
        {!configured && (
          <div className="border-b border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-2.5 text-center text-sm">
            <strong>Demo mode.</strong> Catalog is being served from{' '}
            <code className="rounded bg-black/5 px-1">src/config/verticals.ts</code>. Connect
            Supabase to switch to live data — see <code className="rounded bg-black/5 px-1">SETUP.md</code>.
          </div>
        )}

        {/* --- Hero ------------------------------------------------------- */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:py-20">
          <div>
            <Badge tone="brand">{vertical.label}</Badge>
            <h1 className="mt-4 text-4xl font-bold md:text-5xl">{brand.tagline}</h1>
            <p className="mt-4 max-w-prose text-lg text-[var(--color-muted)]">
              {brand.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book">
                <Button size="lg">{brand.copy.bookCta}</Button>
              </Link>
              <Link href="/memberships">
                <Button size="lg" variant="secondary">
                  See {brand.copy.membershipName.toLowerCase()}s
                </Button>
              </Link>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--color-muted)]">
              <li>Book online in under a minute</li>
              <li>Free changes up to {rules.cancellation.freeCancellationHours} hours before</li>
              <li>Text reminders so you never miss a visit</li>
            </ul>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand.assets.heroImage}
              alt=""
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        </section>

        {/* --- Services --------------------------------------------------- */}
        <section id="services" className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-bold">Services</h2>
          <p className="mt-1 text-[var(--color-muted)]">
            Prices shown are starting rates and vary by {vertical.providerNoun}.
          </p>

          <div className="mt-8 space-y-10">
            {categories.map((category) => (
              <div key={category}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {category}
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {services
                    .filter((s) => s.category === category)
                    .map((service) => (
                      <Card key={service.id} className="flex flex-col p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-medium leading-tight">{service.name}</h4>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {service.price_cents === 0
                              ? 'Free'
                              : formatMoney(service.price_cents)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[var(--color-muted)]">
                          {formatDuration(service.duration_min)}
                          {service.processing_time_min > 0 &&
                            ` · includes ${formatDuration(service.processing_time_min)} processing`}
                        </p>
                        <p className="mt-2 flex-1 text-sm text-[var(--color-muted)]">
                          {service.description}
                        </p>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--color-muted)]">
                            Rebook every {service.rebook_interval_days} days
                          </span>
                          <Link href={`/book?service=${service.id}`}>
                            <Button size="sm" variant="secondary">Book</Button>
                          </Link>
                        </div>
                      </Card>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* --- Membership pitch ------------------------------------------- */}
        <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold">{brand.copy.membershipName}s</h2>
              <p className="mt-2 text-[var(--color-muted)]">
                {brand.copy.membershipPitch}
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {plans.map((plan, i) => (
                <Card key={plan.id} className={i === 1 ? 'border-[var(--color-brand)] p-5' : 'p-5'}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{plan.name}</h3>
                      <p className="mt-1 text-sm text-[var(--color-muted)]">{plan.pitch}</p>
                    </div>
                    {i === 1 && <Badge tone="brand">Most popular</Badge>}
                  </div>

                  <p className="mt-4">
                    <span className="text-3xl font-bold tabular-nums">
                      {formatMoney(plan.price_cents)}
                    </span>
                    <span className="text-[var(--color-muted)]">/{plan.billing_interval}</span>
                  </p>

                  <ul className="mt-4 space-y-2 text-sm">
                    {plan.perks.map((perk) => (
                      <li key={perk} className="flex gap-2">
                        <span aria-hidden className="text-[var(--color-success)]">✓</span>
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href={`/memberships?plan=${plan.slug}`} className="mt-5 block">
                    <Button fullWidth variant={i === 1 ? 'primary' : 'secondary'}>
                      Join {plan.name}
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* --- Team ------------------------------------------------------- */}
        <section id="team" className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-bold">
            Our {vertical.providerNounPlural}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((member) => (
              <Card key={member.id} className="p-5">
                <div
                  className="flex size-12 items-center justify-center rounded-full text-lg font-semibold text-white"
                  style={{ background: member.color }}
                  aria-hidden
                >
                  {member.display_name.split(' ').map((w) => w[0]).join('')}
                </div>
                <h3 className="mt-3 font-medium">{member.display_name}</h3>
                <p className="text-sm text-[var(--color-muted)]">{member.title}</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">{member.bio}</p>
                <Link href={`/book?staff=${member.id}`} className="mt-4 block">
                  <Button size="sm" variant="secondary" fullWidth>
                    Book with {member.display_name.split(' ')[0]}
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </section>

        {/* --- Policy ----------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-4 pb-12">
          <Alert tone="neutral" title="Booking and cancellation">
            <p className="mt-1">
              Changes are free up to {rules.cancellation.freeCancellationHours} hours
              before your {vertical.visitNoun}. Inside that window a fee applies —{' '}
              {rules.cancellation.feeTiers
                .map((t) => `${t.feePercent}% within ${t.withinHours} hours`)
                .join(', ')}
              . Rescheduling is always free the first time.{' '}
              <Link href="/policies" className="underline">Read the full policy</Link>.
            </p>
          </Alert>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
