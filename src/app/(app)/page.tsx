import Link from 'next/link';
import { loadBrand } from '@/lib/brand';
import { vertical } from '@/config/verticals';
import { Badge, Avatar } from '@/components/ui';
import {
  demoServices, demoStaff, demoPlans, isSupabaseConfigured,
} from '@/lib/demo';
import { loadCatalog } from '@/lib/booking/queries';
import { formatMoney, formatDuration, cn } from '@/lib/utils';
import { Screen, ListGroup, ListLink, NextVisitCard } from '@/components/app';
import { loadNextVisit, type NextVisit } from '@/lib/booking/next-visit';

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
  const { brand, businessId, currency, timezone } = await loadBrand();
  const nextVisit = await loadNextVisit();
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

  // In demo mode there is no signed-in client, so nothing would render here.
  // Synthesise the "due to rebook" state from the first preset service: it is
  // the single most important element on this screen and a demo that hides it
  // undersells the product. Flagged by the demo strip above it either way.
  const shownVisit: NextVisit =
    nextVisit.kind === 'none' && !live && services[0]
      ? {
          kind: 'due',
          serviceId: services[0].id,
          serviceName: services[0].name,
          suggestedDate: new Date(Date.now() + 3 * 86_400_000)
            .toISOString()
            .slice(0, 10),
          daysOverdue: 4,
          lastVisitAt: new Date(
            Date.now() - (services[0].rebookIntervalDays + 4) * 86_400_000
          ).toISOString(),
        }
      : nextVisit;

  return (
    <Screen title={brand.name} subtitle={brand.tagline}>
      {!live && (
        <div className="px-4 pb-1 pt-1">
          <Link
            href="/admin/setup"
            className="flex items-center gap-2 rounded-full bg-[var(--color-warning-soft)] px-3 py-1.5 text-[12px] leading-none"
            data-compact-target
          >
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--color-warning)]" />
            <span className="min-w-0 flex-1 truncate">
              Demo mode &middot; {vertical.label} preset
            </span>
            <span className="shrink-0 font-medium opacity-70">Set up →</span>
          </Link>
        </div>
      )}

      <NextVisitCard
        visit={shownVisit}
        timezone={timezone}
        rebookCta={brand.copy.rebookCta}
      />

      {/* --- Primary action ------------------------------------------------
          One unmistakable next step, then small shortcuts. The previous
          two-tile grid pushed icon and label to opposite ends of a tall box
          and left a hole in the middle of both. */}
      <div className="px-4 py-2">
        {/* Suppressed when the next-visit card is showing: that card is already
            the booking action, and two large green CTAs stacked make the
            screen ask the same question twice. */}
        {shownVisit.kind === 'none' && (
        <Link
          href="/book"
          data-press
          className="flex items-center gap-3.5 rounded-[var(--radius-card)] bg-[var(--color-brand)] px-4 py-3.5 text-[var(--color-brand-fg)] shadow-[var(--shadow-lg)]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.7rem] bg-white/15">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden
              fill="none" stroke="currentColor" strokeWidth={1.9}
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.2" y="5" width="17.6" height="16" rx="3" />
              <path d="M8 3v4M16 3v4M3.6 10.2h16.8" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold leading-tight">
              {brand.copy.bookCta}
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug opacity-75">
              Pick a time in under a minute
            </span>
          </span>
          <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden
            className="shrink-0 opacity-60" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.2 1.2 6.6 7l-5.4 5.8" />
          </svg>
        </Link>
        )}

        <div className={cn('grid grid-cols-3 gap-2.5', shownVisit.kind === 'none' && 'mt-2.5')}>
          {shownVisit.kind !== 'none' && (
            <QuickAction href="/book" label={brand.copy.bookCta.split(' ')[0] ?? 'Book'}>
              <rect x="3.2" y="5" width="17.6" height="16" rx="3" />
              <path d="M8 3v4M16 3v4M3.6 10.2h16.8" />
            </QuickAction>
          )}
          <QuickAction
            href={`tel:${brand.contact.phone.replace(/\D/g, '')}`}
            label="Call"
            external
          >
            <path d="M4.5 4h3.2l1.6 4-2 1.4a12.5 12.5 0 0 0 5.3 5.3l1.4-2 4 1.6v3.2a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3 5.6 1.5 1.5 0 0 1 4.5 4z" />
          </QuickAction>
          <QuickAction href="/memberships" label={brand.copy.membershipName}>
            <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9z" />
          </QuickAction>
          {shownVisit.kind === 'none' && (
            <QuickAction href="/account" label={capitalise(vertical.visitNounPlural)}>
              <rect x="3.2" y="5" width="17.6" height="16" rx="3" />
              <path d="M8 3v4M16 3v4M3.6 10.2h16.8" />
            </QuickAction>
          )}
        </div>
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
                media={{ src: null, label: service.name }}
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
          <h3 className="px-5 pb-1.5 font-[family-name:var(--font-body)] text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">
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

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** A small square shortcut. Icon over label, nothing else. */
function QuickAction({
  href, label, external, children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const className =
    'flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] ' +
    'bg-[var(--color-surface)] px-2 py-3 shadow-[var(--shadow-sm)]';

  const inner = (
    <>
      <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden
        className="text-[var(--color-brand)]" fill="none" stroke="currentColor"
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      <span className="w-full truncate text-center text-[12px] font-medium leading-none">
        {label}
      </span>
    </>
  );

  return external ? (
    <a href={href} data-press className={className}>{inner}</a>
  ) : (
    <Link href={href} data-press className={className}>{inner}</Link>
  );
}
