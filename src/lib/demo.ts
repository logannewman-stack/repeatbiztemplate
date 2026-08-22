/**
 * ============================================================================
 * DEMO MODE
 * ============================================================================
 * A freshly cloned template runs with `npm install && npm run dev` and nothing
 * else: no Supabase project, no Stripe account, no environment file. Demo mode
 * serves the catalog straight out of `src/config/verticals.ts` so the whole
 * booking flow can be clicked through immediately.
 *
 * The moment NEXT_PUBLIC_SUPABASE_URL is set to a real project, every one of
 * these functions steps aside and the real queries take over.
 *
 * This exists so a client demo never depends on infrastructure being ready,
 * and so switching verticals in brand.ts visibly re-skins the app on reload.
 * ============================================================================
 */

import { brand } from '@/config/brand';
import { vertical } from '@/config/verticals';
import { slugify } from '@/lib/utils';

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configured = Boolean(url && !url.includes('REPLACE_ME'));
  if (!configured) warnOnce();
  return configured;
}

/**
 * The developer signal, moved rather than removed.
 *
 * A production build hides the on-screen "Demo mode" banners, because those
 * builds are what a prospective owner is shown and the banners are the moment
 * it stops looking like a product. This is where the warning goes instead: a
 * developer sees it in their terminal on the first render, and nobody in a
 * meeting ever does.
 *
 * Once per process, not once per request, or a busy demo fills the log.
 */
let warned = false;
function warnOnce(): void {
  if (warned || typeof window !== 'undefined') return;
  warned = true;
  console.warn(
    '\n[demo mode] NEXT_PUBLIC_SUPABASE_URL is not set, so every screen is\n' +
    '            rendering illustrative sample data. Nothing is being saved.\n' +
    '            See SETUP.md to connect a project.\n' +
    '            On-screen setup hints are hidden in production builds; set\n' +
    '            NEXT_PUBLIC_SETUP_HINTS=1 to show them on a deployment.\n'
  );
}

export const DEMO_BUSINESS_ID = '00000000-0000-0000-0000-000000000001';
export const DEMO_LOCATION_ID = '00000000-0000-0000-0000-000000000101';

export interface DemoService {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  duration_min: number;
  processing_time_min: number;
  finish_time_min: number;
  price_cents: number;
  member_price_cents: number | null;
  rebook_interval_days: number;
  deposit_mode: 'none' | 'flat' | 'percent' | 'full';
  deposit_percent: number;
  deposit_flat_cents: number;
  taxable: boolean;
  addons: DemoAddon[];
}

export interface DemoAddon {
  id: string;
  name: string;
  duration_min: number;
  price_cents: number;
  member_price_cents: number | null;
  taxable: boolean;
  is_recommended: boolean;
}

export interface DemoStaff {
  id: string;
  display_name: string;
  title: string;
  bio: string;
  price_multiplier: number;
  color: string;
}

const STAFF_COLORS = ['#4F7CAC', '#7A9E7E', '#C08552'];

export function demoStaff(): DemoStaff[] {
  return ['Provider One', 'Provider Two', 'Provider Three'].map((name, i) => ({
    id: `demo-staff-${i + 1}`,
    display_name: name,
    title: i === 0 ? `Senior ${titleCase(vertical.providerNoun)}` : titleCase(vertical.providerNoun),
    bio:
      'Placeholder bio. Replace with this ' +
      `${vertical.providerNoun}'s background, specialties, and training.`,
    price_multiplier: [1.2, 1.0, 0.85][i],
    color: STAFF_COLORS[i],
  }));
}

export function demoAddons(): DemoAddon[] {
  return vertical.seedAddons.map((a, i) => ({
    id: `demo-addon-${i + 1}`,
    name: a.name,
    duration_min: a.durationMin,
    price_cents: a.priceCents,
    member_price_cents: Math.round(a.priceCents * 0.9),
    taxable: true,
    is_recommended: i === 0,
  }));
}

export function demoServices(): DemoService[] {
  const addons = demoAddons();

  return vertical.seedServices.map((s, i) => {
    const processing = s.processingMin ?? 0;
    // Split the tail of a processing service into a short finishing block.
    const finish = processing > 0 ? Math.max(Math.round(processing * 0.6), 10) : 0;

    return {
      id: `demo-service-${i + 1}`,
      name: s.name,
      slug: slugify(s.name),
      description:
        'Placeholder description. Replace with real copy describing what ' +
        'this service includes and who it suits.',
      category: s.category,
      duration_min: s.durationMin,
      processing_time_min: processing,
      finish_time_min: finish,
      price_cents: s.priceCents,
      member_price_cents: Math.round(s.priceCents * 0.9),
      rebook_interval_days: s.rebookIntervalDays,
      deposit_mode: s.priceCents >= 15000 ? 'percent' : 'none',
      deposit_percent: 25,
      deposit_flat_cents: 0,
      taxable: true,
      // Show the recommended add-on first, then a couple more.
      addons: addons.slice(0, 3),
    };
  });
}

export function demoCategories(): string[] {
  return [...new Set(vertical.seedServices.map((s) => s.category))];
}

export function demoPlans() {
  return vertical.seedMembershipPlans.map((p, i) => ({
    id: `demo-plan-${i + 1}`,
    name: p.name,
    slug: slugify(p.name),
    pitch: p.pitch,
    description: p.pitch,
    price_cents: p.priceCents,
    billing_interval: p.interval,
    included_credits: p.includedVisits,
    discount_pct: p.discountPct,
    retail_discount_pct: p.discountPct,
    waives_deposits: true,
    priority_booking_days: i === 1 ? 7 : 0,
    rollover_periods: 3,
    perks: [
      p.includedVisits > 0
        ? `${p.includedVisits} included ${p.includedVisits === 1 ? vertical.visitNoun : vertical.visitNounPlural} each month`
        : 'Member pricing on every visit',
      `${p.discountPct}% off all additional services`,
      `${p.discountPct}% off retail`,
      'Unused visits roll over for 3 months',
      'No deposit required',
      ...(i === 1 ? ['Priority booking — 7 days early access'] : []),
    ],
  }));
}

export function demoProducts() {
  return vertical.seedProducts.map((p, i) => ({
    id: `demo-product-${i + 1}`,
    name: p.name,
    price_cents: p.priceCents,
    member_price_cents: Math.round(p.priceCents * 0.9),
    description: 'Placeholder retail item.',
  }));
}

export function demoLocation() {
  return {
    id: DEMO_LOCATION_ID,
    name: 'Main Street',
    address_line1: '123 Example Street',
    city: 'Anytown',
    region: 'NY',
    postal_code: '10001',
    phone: brand.contact.phone,
    email: brand.contact.email,
    timezone: 'America/New_York',
    hours: [
      { weekday: 0, closed: true },
      { weekday: 1, open: '09:00', close: '18:00', closed: false },
      { weekday: 2, open: '09:00', close: '20:00', closed: false },
      { weekday: 3, open: '09:00', close: '20:00', closed: false },
      { weekday: 4, open: '09:00', close: '20:00', closed: false },
      { weekday: 5, open: '09:00', close: '18:00', closed: false },
      { weekday: 6, open: '09:00', close: '16:00', closed: false },
    ],
  };
}

/**
 * Synthetic open slots for the demo booking calendar. Deterministic so the
 * page does not reshuffle on every render — a demo that flickers looks broken.
 */
export function demoSlots(
  service: DemoService,
  fromDate: string,
  days: number,
  staffId?: string | null
): Array<{ date: string; slots: Array<{ startsAt: string; endsAt: string; staffId: string; staffName: string; priceCents: number; durationMin: number }> }> {
  const staff = demoStaff().filter((s) => !staffId || s.id === staffId);
  const location = demoLocation();
  const out = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(`${fromDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + d);
    const dateStr = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();

    const hours = location.hours.find((h) => h.weekday === weekday);
    if (!hours || hours.closed || !hours.open) {
      out.push({ date: dateStr, slots: [] });
      continue;
    }

    const [openH] = hours.open.split(':').map(Number);
    const [closeH] = hours.close!.split(':').map(Number);
    const slots = [];

    for (let h = openH; h < closeH; h++) {
      for (const minute of [0, 30]) {
        // A deterministic pseudo-random gap keeps the demo calendar from
        // looking suspiciously empty or suspiciously full.
        const seed = (d * 37 + h * 11 + minute) % 10;
        if (seed < 4) continue;

        const provider = staff[(d + h) % staff.length];
        const start = new Date(`${dateStr}T00:00:00Z`);
        // Location is US Eastern in the demo; +4 converts EDT to UTC.
        start.setUTCHours(h + 4, minute, 0, 0);
        const end = new Date(start.getTime() + service.duration_min * 60_000);

        slots.push({
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          staffId: provider.id,
          staffName: provider.display_name,
          priceCents: Math.round(service.price_cents * provider.price_multiplier),
          durationMin: service.duration_min,
        });
      }
    }

    out.push({ date: dateStr, slots });
  }

  return out;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Demo account -----------------------------------------------------------

export interface DemoAccount {
  firstName: string;
  loyaltyPoints: number;
  annualSpendCents: number;
  upcoming: Array<{
    id: string; serviceName: string; staffName: string;
    startsAt: string; confirmed: boolean;
  }>;
  past: Array<{
    id: string; serviceId: string; serviceName: string;
    staffName: string; completedAt: string; totalCents: number;
  }>;
  membership: {
    planName: string; priceCents: number; interval: string; creditsBalance: number;
  } | null;
  offers: Array<{ id: string; label: string; code: string; expiresAt: string }>;
}

/**
 * A plausible regular, for demo mode.
 *
 * The account screen is where a prospective owner looks to understand what
 * their clients get, and an empty one with a note about Supabase answers
 * nothing. Everything here is generated relative to today so the dates never
 * go stale, and every screen that renders it labels it as sample data.
 */
export function demoAccount(): DemoAccount {
  const services = demoServices();
  const staff = demoStaff();
  const plans = demoPlans();
  const day = 86_400_000;
  const now = Date.now();

  /** Midday local, so a rendered date never slips either side of midnight. */
  const at = (daysFromNow: number, hour: number) => {
    const d = new Date(now + daysFromNow * day);
    d.setHours(hour, daysFromNow % 2 ? 30 : 0, 0, 0);
    return d.toISOString();
  };

  const usual = services[0];
  const occasional = services[2] ?? services[0];

  return {
    firstName: 'Jordan',
    loyaltyPoints: 640,
    annualSpendCents: 78_500,
    upcoming: [{
      id: 'demo-appt-1',
      serviceName: usual.name,
      staffName: staff[0].display_name,
      startsAt: at(9, 14),
      confirmed: false,
    }],
    past: [
      { id: 'demo-past-1', serviceId: usual.id, serviceName: usual.name,
        staffName: staff[0].display_name, completedAt: at(-33, 14),
        totalCents: usual.price_cents },
      { id: 'demo-past-2', serviceId: occasional.id, serviceName: occasional.name,
        staffName: staff[1]?.display_name ?? staff[0].display_name,
        completedAt: at(-61, 11), totalCents: occasional.price_cents },
      { id: 'demo-past-3', serviceId: usual.id, serviceName: usual.name,
        staffName: staff[0].display_name, completedAt: at(-95, 16),
        totalCents: usual.price_cents },
    ],
    membership: plans[0]
      ? {
          planName: plans[0].name,
          priceCents: plans[0].price_cents,
          interval: plans[0].billing_interval,
          creditsBalance: 1,
        }
      : null,
    offers: [{
      id: 'demo-offer-1',
      label: '$25 off your next visit — thanks for the referral',
      code: 'THANKYOU25',
      expiresAt: at(21, 12),
    }],
  };
}
