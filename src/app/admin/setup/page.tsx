import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/demo';
import { loadBrand } from '@/lib/brand';
import { oklchToHex } from '@/lib/brand';
import { verticals } from '@/config/verticals';
import { SetupWizard } from '@/components/admin/SetupWizard';
import { Alert } from '@/components/ui';

export const metadata = { title: 'Setup' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const { brand, businessId, timezone, currency, taxRateBps } = await loadBrand();

  const verticalOptions = Object.entries(verticals).map(([key, preset]) => ({
    key,
    label: preset.label,
    clientNoun: preset.clientNoun,
    providerNoun: preset.providerNoun,
    visitNoun: preset.visitNoun,
    serviceCount: preset.seedServices.length,
    addonCount: preset.seedAddons.length,
    planCount: preset.seedMembershipPlans.length,
    productCount: preset.seedProducts.length,
    sampleServices: preset.seedServices.slice(0, 3).map((s) => s.name),
    rebookIntervalDays: preset.rebookIntervalDays,
  }));

  if (!isSupabaseConfigured() || !businessId) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Setup</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Everything a new client build needs, in one place.
          </p>
        </header>

        <Alert tone="warning" title="Connect Supabase to save">
          <p className="mt-1">
            The wizard writes branding, services, and staff to the database, so
            it needs a connected project. You can still click through it to see
            what it collects — see <code>SETUP.md</code> step 4.
          </p>
        </Alert>

        <SetupWizard
          businessId={null}
          locationId={null}
          initial={{
            name: brand.name,
            shortName: brand.shortName,
            tagline: brand.tagline,
            description: brand.description,
            vertical: brand.vertical,
            phone: brand.contact.phone,
            email: brand.contact.email,
            website: brand.contact.website,
            instagram: brand.contact.instagram ?? '',
            brandColor: oklchToHex(brand.colors.brand),
            radius: brand.radius,
            logoUrl: null,
            logoMarkUrl: null,
            heroUrl: null,
            timezone,
            currency,
            taxRatePercent: taxRateBps / 100,
            addressLine1: '',
            city: '',
            region: '',
            postalCode: '',
          }}
          verticalOptions={verticalOptions}
          counts={{ services: 0, staff: 0, addons: 0, plans: 0 }}
          hours={defaultHours()}
          demo
        />
      </div>
    );
  }

  const supabase = createAdminClient();

  const [
    { data: location },
    { count: serviceCount },
    { count: staffCount },
    { count: addonCount },
    { count: planCount },
  ] = await Promise.all([
    supabase
      .from('locations')
      .select('*')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('sort_order')
      .limit(1)
      .maybeSingle(),
    supabase.from('services').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('active', true),
    supabase.from('staff').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('active', true).eq('bookable', true),
    supabase.from('addons').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('active', true),
    supabase.from('membership_plans').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('active', true),
  ]);

  const storedHours = Array.isArray(location?.hours)
    ? (location.hours as unknown as Array<{
        weekday: number; open?: string; close?: string; closed?: boolean;
      }>)
    : [];

  const hours = defaultHours().map((day) => {
    const stored = storedHours.find((h) => h.weekday === day.weekday);
    return stored
      ? {
          weekday: day.weekday,
          open: stored.open ?? '09:00',
          close: stored.close ?? '17:00',
          closed: stored.closed ?? false,
        }
      : day;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Setup</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Everything a new client build needs, in one place. Changes go live
          immediately — no redeploy.
        </p>
      </header>

      <SetupWizard
        businessId={businessId}
        locationId={location?.id ?? null}
        initial={{
          name: brand.name,
          shortName: brand.shortName,
          tagline: brand.tagline,
          description: brand.description,
          vertical: brand.vertical,
          phone: location?.phone ?? brand.contact.phone,
          email: location?.email ?? brand.contact.email,
          website: brand.contact.website,
          instagram: brand.contact.instagram ?? '',
          brandColor: oklchToHex(brand.colors.brand),
          radius: brand.radius,
          logoUrl: brand.assets.logo.startsWith('http') ? brand.assets.logo : null,
          logoMarkUrl: brand.assets.logoMark.startsWith('http') ? brand.assets.logoMark : null,
          heroUrl: brand.assets.heroImage.startsWith('http') ? brand.assets.heroImage : null,
          timezone,
          currency,
          taxRatePercent: taxRateBps / 100,
          addressLine1: location?.address_line1 ?? '',
          city: location?.city ?? '',
          region: location?.region ?? '',
          postalCode: location?.postal_code ?? '',
        }}
        verticalOptions={verticalOptions}
        counts={{
          services: serviceCount ?? 0,
          staff: staffCount ?? 0,
          addons: addonCount ?? 0,
          plans: planCount ?? 0,
        }}
        hours={hours}
      />
    </div>
  );
}

function defaultHours() {
  return [
    { weekday: 0, open: '10:00', close: '16:00', closed: true },
    { weekday: 1, open: '09:00', close: '18:00', closed: false },
    { weekday: 2, open: '09:00', close: '20:00', closed: false },
    { weekday: 3, open: '09:00', close: '20:00', closed: false },
    { weekday: 4, open: '09:00', close: '20:00', closed: false },
    { weekday: 5, open: '09:00', close: '18:00', closed: false },
    { weekday: 6, open: '09:00', close: '16:00', closed: false },
  ];
}
