import Link from 'next/link';
import { loadBrand } from '@/lib/brand';
import { vertical } from '@/config/verticals';
import { rules } from '@/config/rules';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Button, Card, Badge, Alert, Avatar } from '@/components/ui';
import {
  demoServices, demoStaff, demoPlans, isSupabaseConfigured,
} from '@/lib/demo';
import { loadCatalog } from '@/lib/booking/queries';
import { formatMoney, formatDuration } from '@/lib/utils';

export const revalidate = 60;

interface DisplayService {
  id: string;
  name: string;
  description: string | null;
  category: string;
  durationMin: number;
  processingMin: number;
  priceCents: number;
  rebookIntervalDays: number;
}

interface DisplayStaff {
  id: string;
  name: string;
  title: string;
  bio: string;
  color: string;
  avatarUrl: string | null;
}

interface DisplayPlan {
  id: string;
  slug: string;
  name: string;
  pitch: string;
  priceCents: number;
  interval: string;
  perks: string[];
}

export default async function HomePage() {
  const { brand, businessId, currency } = await loadBrand();
  const live = isSupabaseConfigured() && Boolean(businessId);

  let services: DisplayService[] = demoServices().map((s) => ({
    id: s.id, name: s.name, description: s.description, category: s.category,
    durationMin: s.duration_min, processingMin: s.processing_time_min,
    priceCents: s.price_cents, rebookIntervalDays: s.rebook_interval_days,
  }));

  let staff: DisplayStaff[] = demoStaff().map((s) => ({
    id: s.id, name: s.display_name, title: s.title, bio: s.bio,
    color: s.color, avatarUrl: null,
  }));

  let plans: DisplayPlan[] = demoPlans().map((p) => ({
    id: p.id, slug: p.slug, name: p.name, pitch: p.pitch,
    priceCents: p.price_cents, interval: p.billing_interval, perks: p.perks,
  }));

  if (live) {
    try {
      const catalog = await loadCatalog(businessId!);
      const categoryNames = new Map(catalog.categories.map((c) => [c.id, c.name]));

      if (catalog.services.length) {
        services = catalog.services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: categoryNames.get(s.category_id ?? '') ?? 'Services',
          durationMin: s.duration_min,
          processingMin: s.processing_time_min,
          priceCents: s.price_cents,
          rebookIntervalDays: s.rebook_interval_days,
        }));
      }

      if (catalog.staff.length) {
        staff = catalog.staff.map((s) => ({
          id: s.id,
          name: s.display_name,
          title: s.title ?? vertical.providerNoun,
          bio: s.bio ?? '',
          color: s.color ?? '#4F7CAC',
          avatarUrl: s.avatar_url,
        }));
      }

      if (catalog.plans.length) {
        plans = catalog.plans.map((p) => ({
          id: p.id, slug: p.slug, name: p.name,
          pitch: p.pitch ?? p.description ?? '',
          priceCents: p.price_cents, interval: p.billing_interval,
          perks: Array.isArray(p.perks) ? (p.perks as string[]) : [],
        }));
      }
    } catch {
      // Fall through to the preset. A landing page showing placeholder services
      // beats one that 500s while the database is briefly unhappy.
    }
  }

  const categories = [...new Set(services.map((s) => s.category))];

  return (
    <>
      <SiteHeader />

      <main id="main">
        {!live && (
          <div className="border-b border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-2.5 text-center text-sm">
            <strong>Demo mode.</strong> Showing the {vertical.label} preset.
            Connect Supabase and use{' '}
            <Link href="/admin/setup" className="underline">Setup</Link> to make
            this a real business.
          </div>
        )}

        {/* --- Hero -------------------------------------------------------- */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-24">
          <div>
            <Badge tone="brand">{vertical.label}</Badge>
            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
              {brand.tagline}
            </h1>
            <p className="mt-4 max-w-prose text-lg text-[var(--color-muted)]">
              {brand.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book">
                <Button size="lg">{brand.copy.bookCta}</Button>
              </Link>
              {plans.length > 0 && (
                <Link href="/memberships">
                  <Button size="lg" variant="secondary">
                    See {brand.copy.membershipName.toLowerCase()}s
                  </Button>
                </Link>
              )}
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--color-muted)]">
              <li className="flex items-start gap-1.5">
                <Check /> Book online in under a minute
              </li>
              <li className="flex items-start gap-1.5">
                <Check /> Free changes up to {rules.cancellation.freeCancellationHours} hours before
              </li>
              <li className="flex items-start gap-1.5">
                <Check /> Text reminders before every visit
              </li>
            </ul>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand.assets.heroImage}
              alt=""
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        </section>

        {/* --- Services ---------------------------------------------------- */}
        <section id="services" className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold tracking-tight">Services</h2>
          <p className="mt-1 text-[var(--color-muted)]">
            Prices are starting rates and vary by {vertical.providerNoun}.
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
                      <Card
                        key={service.id}
                        className="flex flex-col p-4 transition-colors hover:border-[var(--color-brand)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-medium leading-tight">{service.name}</h4>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {service.priceCents === 0
                              ? 'Free'
                              : formatMoney(service.priceCents, currency)}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-[var(--color-muted)]">
                          {formatDuration(service.durationMin)}
                          {service.processingMin > 0 &&
                            ` · ${formatDuration(service.processingMin)} processing`}
                        </p>

                        {service.description && (
                          <p className="mt-2 flex-1 text-sm text-[var(--color-muted)]">
                            {service.description}
                          </p>
                        )}

                        <div className="mt-4 flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--color-muted)]">
                            Every ~{service.rebookIntervalDays} days
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

        {/* --- Memberships ------------------------------------------------- */}
        {plans.length > 0 && (
          <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="mx-auto max-w-6xl px-4 py-14">
              <div className="max-w-2xl">
                <h2 className="text-2xl font-bold tracking-tight">
                  {brand.copy.membershipName}s
                </h2>
                <p className="mt-2 text-[var(--color-muted)]">
                  {brand.copy.membershipPitch}
                </p>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {plans.slice(0, 2).map((plan, i) => (
                  <Card
                    key={plan.id}
                    className={
                      i === 1
                        ? 'border-2 border-[var(--color-brand)] p-5 shadow-sm'
                        : 'p-5'
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{plan.name}</h3>
                        {plan.pitch && (
                          <p className="mt-1 text-sm text-[var(--color-muted)]">{plan.pitch}</p>
                        )}
                      </div>
                      {i === 1 && <Badge tone="brand">Most popular</Badge>}
                    </div>

                    <p className="mt-4">
                      <span className="text-3xl font-bold tabular-nums">
                        {formatMoney(plan.priceCents, currency)}
                      </span>
                      <span className="text-[var(--color-muted)]">/{plan.interval}</span>
                    </p>

                    <ul className="mt-4 space-y-2 text-sm">
                      {plan.perks.slice(0, 6).map((perk) => (
                        <li key={perk} className="flex gap-2">
                          <Check />
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
        )}

        {/* --- Team -------------------------------------------------------- */}
        {staff.length > 0 && (
          <section id="team" className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-2xl font-bold tracking-tight">
              Our {vertical.providerNounPlural}
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {staff.map((member) => (
                <Card key={member.id} className="p-5">
                  <Avatar
                    name={member.name}
                    src={member.avatarUrl}
                    color={member.color}
                    size="lg"
                  />
                  <h3 className="mt-3 font-medium">{member.name}</h3>
                  <p className="text-sm text-[var(--color-muted)]">{member.title}</p>
                  {member.bio && (
                    <p className="mt-2 text-sm text-[var(--color-muted)]">{member.bio}</p>
                  )}
                  <Link href={`/book?staff=${member.id}`} className="mt-4 block">
                    <Button size="sm" variant="secondary" fullWidth>
                      Book with {member.name.split(' ')[0]}
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* --- Policy ------------------------------------------------------ */}
        <section className="mx-auto max-w-6xl px-4 pb-14">
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

function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 4L6 12l-3-3" />
    </svg>
  );
}
