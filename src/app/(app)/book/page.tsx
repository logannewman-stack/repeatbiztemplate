import { Suspense } from 'react';
import type { Metadata } from 'next';
import { brand } from '@/config/brand';
import { vertical } from '@/config/verticals';
import { rules } from '@/config/rules';
import { BookingFlow } from '@/components/booking/BookingFlow';
import {
  demoServices, demoStaff, demoPlans, demoLocation, isSupabaseConfigured,
} from '@/lib/demo';
import { loadBusiness, loadCatalog } from '@/lib/booking/queries';
import { Screen } from '@/components/app';

export const metadata: Metadata = {
  title: 'Book an appointment',
  description: `Book online at ${brand.name}.`,
};

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; staff?: string }>;
}) {
  const params = await searchParams;
  const demoMode = !isSupabaseConfigured();

  // Demo mode renders the vertical preset so a fresh clone is clickable
  // before any infrastructure exists. See src/lib/demo.ts.
  let services = demoServices();
  let staff = demoStaff();
  let plans = demoPlans();
  let timezone = demoLocation().timezone;
  let currency = 'USD';
  let taxRateBps = 700;
  let loadFailed = false;

  if (!demoMode) {
    try {
      const business = await loadBusiness();
      if (!business) throw new Error('No business row found.');

      const catalog = await loadCatalog(business.id);
      timezone = business.timezone;
      currency = business.currency;
      taxRateBps = business.tax_rate_bps;

      services = catalog.services.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        category: '',
        duration_min: s.duration_min,
        processing_time_min: s.processing_time_min,
        finish_time_min: s.finish_time_min,
        price_cents: s.price_cents,
        member_price_cents: s.member_price_cents,
        rebook_interval_days: s.rebook_interval_days,
        deposit_mode: s.deposit_mode,
        deposit_percent: s.deposit_percent,
        deposit_flat_cents: s.deposit_flat_cents,
        taxable: s.taxable,
        addons: (
          (s as unknown as {
            service_addons?: Array<{
              is_recommended: boolean;
              addons: {
                id: string; name: string; duration_min: number;
                price_cents: number; member_price_cents: number | null; taxable: boolean;
              } | null;
            }>;
          }).service_addons ?? []
        )
          .filter((sa) => sa.addons)
          .map((sa) => ({
            id: sa.addons!.id,
            name: sa.addons!.name,
            duration_min: sa.addons!.duration_min,
            price_cents: sa.addons!.price_cents,
            member_price_cents: sa.addons!.member_price_cents,
            taxable: sa.addons!.taxable,
            is_recommended: sa.is_recommended,
          })),
      }));

      staff = catalog.staff.map((s) => ({
        id: s.id,
        display_name: s.display_name,
        title: s.title ?? '',
        bio: s.bio ?? '',
        price_multiplier: Number(s.price_multiplier),
        color: s.color ?? '#4F7CAC',
      }));

      plans = catalog.plans.map((p) => ({
        id: p.id, name: p.name, slug: p.slug, pitch: p.pitch ?? '',
        description: p.description ?? '', price_cents: p.price_cents,
        billing_interval: p.billing_interval as 'month' | 'year',
        included_credits: p.included_credits, discount_pct: p.discount_pct,
        retail_discount_pct: p.retail_discount_pct,
        waives_deposits: p.waives_deposits,
        priority_booking_days: p.priority_booking_days,
        rollover_periods: p.rollover_periods,
        perks: Array.isArray(p.perks) ? (p.perks as string[]) : [],
      }));
    } catch (err) {
      // The catalog is unreachable — bad credentials, a paused project, a
      // network blip. Never fall back to the demo catalog here: showing
      // placeholder services and prices to a real customer is worse than
      // showing nothing. Send them to the phone instead.
      console.error('[book] Could not load the live catalog:', err);
      loadFailed = true;
    }
  }

  if (loadFailed) {
    return (
      <>
        <Screen title={brand.copy.bookCta}><div className="px-4">
          <h1 className="text-2xl font-bold">Online booking is unavailable</h1>
          <p className="mt-2 text-[var(--color-muted)]">
            We&apos;re having trouble loading our calendar. Give us a call and
            we&apos;ll get you booked in.
          </p>
          <a
            href={`tel:${brand.contact.phone.replace(/\D/g, '')}`}
            className="mt-6 inline-block text-lg font-semibold text-[var(--color-brand)] underline underline-offset-4"
          >
            {brand.contact.phone}
          </a>
        </div></Screen>
      </>
    );
  }

  return (
    <>
      <Screen title={brand.copy.bookCta}><div>
        <Suspense fallback={<p className="px-4 text-center text-sm">Loading…</p>}>
          <BookingFlow
            services={services}
            staff={staff}
            plans={plans}
            timezone={timezone}
            currency={currency}
            taxRateBps={taxRateBps}
            freeCancellationHours={rules.cancellation.freeCancellationHours}
            initialServiceId={params.service ?? null}
            initialStaffId={params.staff ?? null}
            demoMode={demoMode}
            visitNoun={vertical.visitNoun}
            providerNoun={vertical.providerNoun}
          />
        </Suspense>
      </div></Screen>
    </>
  );
}
