import { createAdminClient } from '@/lib/supabase/admin';
import { loadBrand } from '@/lib/brand';
import { isSupabaseConfigured, demoServices, demoAddons } from '@/lib/demo';
import { vertical } from '@/config/verticals';
import { Alert } from '@/components/ui';
import { ServicesManager } from '@/components/admin/ServicesManager';

export const metadata = { title: 'Services' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const { businessId, currency } = await loadBrand();

  if (!isSupabaseConfigured() || !businessId) {
    // Demo mode shows the vertical preset read-only, so the screen is
    // demonstrable without a database behind it.
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Services</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            What you sell, how long it takes, and when {vertical.clientNounPlural} come back.
          </p>
        </header>

        <Alert tone="warning" title="Demo mode">
          These are the {vertical.label} preset values from{' '}
          <code>src/config/verticals.ts</code>. Connect Supabase to edit them —
          see <code>SETUP.md</code>.
        </Alert>

        <ServicesManager
          services={demoServices().map((s) => ({
            id: s.id, name: s.name, description: s.description,
            categoryId: null, categoryName: s.category,
            durationMin: s.duration_min, processingMin: s.processing_time_min,
            finishMin: s.finish_time_min, priceCents: s.price_cents,
            memberPriceCents: s.member_price_cents,
            rebookIntervalDays: s.rebook_interval_days,
            depositMode: s.deposit_mode, depositPercent: s.deposit_percent,
            depositFlatCents: s.deposit_flat_cents,
            onlineBookable: true, active: true, sortOrder: 0,
            providerCount: 3, bookingCount: 0,
          }))}
          addons={demoAddons().map((a) => ({
            id: a.id, name: a.name, description: null,
            durationMin: a.duration_min, priceCents: a.price_cents,
            active: true, attachRate: null,
          }))}
          categories={[]}
          currency={currency}
          readOnly
        />
      </div>
    );
  }

  const supabase = createAdminClient();

  const [
    { data: services },
    { data: addons },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from('services')
      .select('*, service_categories(name), service_staff(staff_id)')
      .eq('business_id', businessId)
      .order('sort_order'),
    supabase
      .from('addons')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order'),
    supabase
      .from('service_categories')
      .select('*')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('sort_order'),
  ]);

  // Booking counts decide whether a service can be deleted or only archived.
  const bookingCounts = new Map<string, number>();
  if (services?.length) {
    const { data: rows } = await supabase
      .from('appointments')
      .select('service_id')
      .eq('business_id', businessId);
    for (const row of rows ?? []) {
      bookingCounts.set(row.service_id, (bookingCounts.get(row.service_id) ?? 0) + 1);
    }
  }

  // Attach rate is the number that tells an owner whether an add-on earns its
  // place in the booking flow, which only shows three.
  const attachRates = new Map<string, number>();
  if (addons?.length) {
    const [{ count: totalAppointments }, { data: addonRows }] = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .eq('business_id', businessId).eq('status', 'completed'),
      supabase.from('appointment_addons').select('addon_id'),
    ]);

    if (totalAppointments) {
      const counts = new Map<string, number>();
      for (const row of addonRows ?? []) {
        counts.set(row.addon_id, (counts.get(row.addon_id) ?? 0) + 1);
      }
      for (const [addonId, count] of counts) {
        attachRates.set(addonId, Math.round((count / totalAppointments) * 1000) / 10);
      }
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Services</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          What you sell, how long it takes, and when {vertical.clientNounPlural} come back.
        </p>
      </header>

      <ServicesManager
        services={(services ?? []).map((s) => {
          const category = s.service_categories as unknown as { name: string } | null;
          const staff = (s.service_staff as unknown as Array<{ staff_id: string }>) ?? [];
          return {
            id: s.id,
            name: s.name,
            description: s.description,
            categoryId: s.category_id,
            categoryName: category?.name ?? null,
            durationMin: s.duration_min,
            processingMin: s.processing_time_min,
            finishMin: s.finish_time_min,
            priceCents: s.price_cents,
            memberPriceCents: s.member_price_cents,
            rebookIntervalDays: s.rebook_interval_days,
            depositMode: s.deposit_mode,
            depositPercent: s.deposit_percent,
            depositFlatCents: s.deposit_flat_cents,
            onlineBookable: s.online_bookable,
            active: s.active,
            sortOrder: s.sort_order,
            providerCount: staff.length,
            bookingCount: bookingCounts.get(s.id) ?? 0,
          };
        })}
        addons={(addons ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          durationMin: a.duration_min,
          priceCents: a.price_cents,
          active: a.active,
          attachRate: attachRates.get(a.id) ?? null,
        }))}
        categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
        currency={currency}
      />
    </div>
  );
}
