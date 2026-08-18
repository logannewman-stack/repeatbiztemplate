import Link from 'next/link';
import { loadBrand } from '@/lib/brand';
import { vertical } from '@/config/verticals';
import { Badge, Avatar } from '@/components/ui';
import {
  demoServices, demoStaff, demoPlans, isSupabaseConfigured,
} from '@/lib/demo';
import { loadCatalog } from '@/lib/booking/queries';
import { formatMoney, formatDuration } from '@/lib/utils';
import { Screen, ListGroup, ListLink } from '@/components/app';

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
    <Screen title={brand.name} subtitle={brand.tagline}>
      {!live && (
        <div className="px-4 pb-1 pt-2">
          <div className="rounded-[var(--radius-card)] bg-[var(--color-warning-soft)] px-4 py-3 text-[13px] leading-snug">
            <strong>Demo mode.</strong> Showing the {vertical.label} preset.
            Connect Supabase and use{' '}
            <Link href="/admin/setup" className="underline">Setup</Link> to make
            this a real business.
          </div>
        </div>
      )}

      {/* --- Primary actions ---------------------------------------------
          An app opens to what you came to do. The two things a returning
          client wants are a booking and a phone number, so they are the first
          thing under the title rather than the last thing under a hero. */}
      <div className="grid grid-cols-2 gap-3 px-4 py-3">
        <Link
          href="/book"
          data-press
          className="flex flex-col justify-between rounded-[var(--radius-card)] bg-[var(--color-brand)] p-4 text-[var(--color-brand-fg)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden
            fill="none" stroke="currentColor" strokeWidth={1.9}
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.2" y="5" width="17.6" height="16" rx="3" />
            <path d="M8 3v4M16 3v4M3.6 10.2h16.8" />
          </svg>
          <span className="mt-6 block text-[17px] font-semibold leading-tight">
            {brand.copy.bookCta}
          </span>
          <span className="mt-0.5 block text-[13px] opacity-80">
            Pick a time in under a minute
          </span>
        </Link>

        <a
          href={`tel:${brand.contact.phone.replace(/\D/g, '')}`}
          data-press
          className="flex flex-col justify-between rounded-[var(--radius-card)] bg-[var(--color-surface)] p-4"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden
            className="text-[var(--color-brand)]"
            fill="none" stroke="currentColor" strokeWidth={1.9}
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 4h3.2l1.6 4-2 1.4a12.5 12.5 0 0 0 5.3 5.3l1.4-2 4 1.6v3.2a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3 5.6 1.5 1.5 0 0 1 4.5 4z" />
          </svg>
          <span className="mt-6 block text-[17px] font-semibold leading-tight">
            Call us
          </span>
          <span className="mt-0.5 block text-[13px] text-[var(--color-muted)]">
            {brand.contact.phone}
          </span>
        </a>
      </div>

      {/* --- Services -----------------------------------------------------
          A grouped list, not a card grid. Price and duration are the two
          things people scan for, so they sit on the row itself. */}
      {categories.map((category) => {
        const inCategory = services.filter((s) => s.category === category);
        if (!inCategory.length) return null;

        return (
          <ListGroup key={category} header={category}>
            {inCategory.map((service) => (
              <ListLink
                key={service.id}
                href={`/book?service=${service.id}`}
                label={service.name}
                detail={
                  formatDuration(service.durationMin + service.processingMin)
                }
                value={formatMoney(service.priceCents, currency)}
              />
            ))}
          </ListGroup>
        );
      })}

      {/* --- Membership ---------------------------------------------------
          Recurring revenue is the point of the product, so it gets a promoted
          block rather than a row in a list. */}
      {plans.length > 0 && (
        <div className="px-4 py-2">
          <Link
            href="/memberships"
            data-press
            className="block overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)]"
          >
            <div className="bg-[var(--color-brand-soft)] px-4 py-3">
              <Badge tone="brand">{brand.copy.membershipName}</Badge>
              <p className="mt-2 text-[17px] font-semibold leading-snug">
                {brand.copy.membershipPitch}
              </p>
            </div>

            <div className="px-4 py-3">
              {plans.slice(0, 2).map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-baseline justify-between gap-3 py-1"
                >
                  <span className="truncate text-[15px]">{plan.name}</span>
                  <span className="shrink-0 text-[15px] font-medium">
                    {formatMoney(plan.priceCents, currency)}
                    <span className="text-[13px] font-normal text-[var(--color-muted)]">
                      /{plan.interval === 'year' ? 'yr' : 'mo'}
                    </span>
                  </span>
                </div>
              ))}
              <p className="mt-2 text-[13px] font-medium text-[var(--color-brand)]">
                See all plans →
              </p>
            </div>
          </Link>
        </div>
      )}

      {/* --- Team ---------------------------------------------------------
          Horizontally scrolled, the way a native app shows a short roster. */}
      {staff.length > 0 && (
        <section className="py-2">
          <h3 className="px-5 pb-1.5 text-[13px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Our {vertical.providerNounPlural}
          </h3>
          <div className="scroll-x flex gap-3 px-4 pb-1">
            {staff.map((member) => (
              <div
                key={member.id}
                className="w-24 shrink-0 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-3 text-center"
              >
                <Avatar
                  name={member.name}
                  src={member.avatarUrl}
                  color={member.color}
                  size="lg"
                />
                <p className="mt-2 truncate text-[13px] font-medium">
                  {member.name}
                </p>
                <p className="truncate text-[11px] text-[var(--color-muted)]">
                  {member.title}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- Everything else ---------------------------------------------- */}
      <ListGroup header="More">
        <ListLink href="/gift-cards" label="Gift cards" />
        <ListLink href="/account" label={`My ${vertical.visitNounPlural}`} />
        <ListLink href="/policies" label="Policies" />
        <ListLink
          href={`mailto:${brand.contact.email}`}
          label="Email us"
          value={brand.contact.email}
          external
        />
        {brand.contact.instagram && (
          <ListLink
            href={`https://instagram.com/${brand.contact.instagram.replace('@', '')}`}
            label="Instagram"
            value={brand.contact.instagram}
            external
          />
        )}
        {brand.contact.facebook && (
          <ListLink
            href={brand.contact.facebook}
            label="Facebook"
            external
          />
        )}
        {brand.contact.tiktok && (
          <ListLink
            href={`https://tiktok.com/@${brand.contact.tiktok.replace('@', '')}`}
            label="TikTok"
            value={brand.contact.tiktok}
            external
          />
        )}
      </ListGroup>
    </Screen>
  );
}
