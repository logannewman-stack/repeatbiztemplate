/**
 * ============================================================================
 * RUNTIME BRAND RESOLUTION
 * ============================================================================
 * `src/config/brand.ts` holds the defaults compiled into the build. The
 * `businesses.branding` JSONB column holds whatever the owner set through
 * Admin → Setup. This merges the two, so a client can upload a logo, type
 * their name, and pick a color without anyone touching a file or redeploying.
 *
 * Precedence: database → config → hard defaults.
 *
 * Everything user-facing reads `resolveBrand()`, never `brand` directly, so
 * there is exactly one place that decides what the business is called.
 * ============================================================================
 */

import { cache } from 'react';
import { brand as configBrand, radiusScale, type BrandConfig } from '@/config/brand';
import { deepMerge } from '@/lib/utils';
import { isSupabaseConfigured } from '@/lib/demo';
import type { Json } from '@/types/database';

export type ResolvedBrand = BrandConfig;

/** Merge the stored overrides on top of the compiled config. */
export function resolveBrand(branding: Json | null | undefined): ResolvedBrand {
  if (!branding || typeof branding !== 'object' || Array.isArray(branding)) {
    return configBrand;
  }
  return deepMerge(configBrand, branding);
}

/**
 * Load the brand for this deployment.
 *
 * Wrapped in React's `cache` so the many components that need the business
 * name during one render share a single query rather than each issuing their
 * own. Falls back to the compiled config whenever the database is absent or
 * unreachable — a booking page that renders with placeholder branding is far
 * better than one that does not render.
 */
export const loadBrand = cache(async (): Promise<{
  brand: ResolvedBrand;
  businessId: string | null;
  timezone: string;
  currency: string;
  taxRateBps: number;
  live: boolean;
}> => {
  const fallback = {
    brand: configBrand,
    businessId: null,
    timezone: 'America/New_York',
    currency: 'USD',
    taxRateBps: 0,
    live: false,
  };

  if (!isSupabaseConfigured()) return fallback;

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();
    const slug = process.env.NEXT_PUBLIC_BUSINESS_SLUG;

    const query = supabase
      .from('businesses')
      .select('id, name, slug, branding, timezone, currency, tax_rate_bps, vertical');

    const { data } = slug
      ? await query.eq('slug', slug).maybeSingle()
      : await query.order('created_at').limit(1).maybeSingle();

    if (!data) return fallback;

    const resolved = resolveBrand(data.branding);

    return {
      // The `businesses.name` column is the source of truth for the name even
      // if the branding blob disagrees — it is what staff edit most often.
      brand: { ...resolved, name: data.name || resolved.name, slug: data.slug },
      businessId: data.id,
      timezone: data.timezone,
      currency: data.currency,
      taxRateBps: data.tax_rate_bps,
      live: true,
    };
  } catch {
    return fallback;
  }
});

/** CSS custom properties for a resolved brand. Applied on `<body>`. */
export function brandCssVars(b: ResolvedBrand): React.CSSProperties {
  return {
    '--color-brand': b.colors.brand,
    '--color-brand-fg': b.colors.brandForeground,
    '--color-accent': b.colors.accent,
    '--color-accent-fg': b.colors.accentForeground,
    '--color-success': b.colors.success,
    '--color-warning': b.colors.warning,
    '--color-danger': b.colors.danger,
    '--radius-card': radiusScale[b.radius] ?? '0.75rem',
    '--font-heading': b.fonts.heading,
    '--font-body': b.fonts.body,
  } as React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Color conversion
// ---------------------------------------------------------------------------
// The setup wizard takes hex, because that is what every brand guide and every
// client email contains. The app stores OKLCH, because deriving hover, muted,
// and soft variants from hex produces muddy results — OKLCH keeps perceived
// lightness stable when you shift chroma.

/** `#4F7CAC` → `oklch(0.55 0.09 250)`. Accepts 3- or 6-digit hex. */
export function hexToOklch(hex: string): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean.padEnd(6, '0').slice(0, 6);

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  if ([r, g, b].some(Number.isNaN)) return 'oklch(0.5 0 0)';

  // sRGB → linear
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];

  // linear sRGB → LMS (Oklab matrix)
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

/** Inverse of `hexToOklch`, for pre-filling a color input. */
export function oklchToHex(oklch: string): string {
  const match = oklch.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!match) return '#000000';

  const L = Number(match[1]);
  const C = Number(match[2]);
  const H = (Number(match[3]) * Math.PI) / 180;

  const A = C * Math.cos(H);
  const B = C * Math.sin(H);

  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const gamma = (c: number) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

  const toHex = (c: number) =>
    Math.round(Math.max(0, Math.min(1, gamma(c))) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(lr)}${toHex(lg)}${toHex(lb)}`;
}

/**
 * Derive a full palette from one brand color.
 *
 * The wizard asks for a single hex — nobody standing up a salon site wants to
 * pick nine colors. Foreground is chosen for contrast against the brand color,
 * and the accent is placed opposite on the hue wheel so upsell and membership
 * highlights read as deliberately different rather than as a near-miss.
 */
export function derivePalette(brandHex: string): BrandConfig['colors'] {
  const base = hexToOklch(brandHex);
  const match = base.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/);

  const L = match ? Number(match[1]) : 0.52;
  const C = match ? Number(match[2]) : 0.13;
  const H = match ? Number(match[3]) : 250;

  // Light text on a dark brand color, dark text on a light one.
  const onBrand = L > 0.65 ? 'oklch(0.20 0.02 250)' : 'oklch(0.99 0 0)';
  const accentHue = (H + 150) % 360;

  return {
    brand: base,
    brandForeground: onBrand,
    accent: `oklch(0.70 0.15 ${accentHue.toFixed(1)})`,
    accentForeground: 'oklch(0.20 0.02 45)',
    background: `oklch(0.99 0.002 ${H.toFixed(1)})`,
    surface: 'oklch(1 0 0)',
    foreground: `oklch(0.22 0.015 ${H.toFixed(1)})`,
    muted: `oklch(0.55 0.012 ${H.toFixed(1)})`,
    border: `oklch(0.91 0.005 ${H.toFixed(1)})`,
    // Semantic colors keep their conventional hues — a green "success" that
    // has been dragged toward the brand hue stops reading as success.
    success: 'oklch(0.62 0.13 155)',
    warning: 'oklch(0.75 0.14 75)',
    danger: 'oklch(0.58 0.19 25)',
  };
}
