/**
 * ============================================================================
 * FORK POINT #1 — BRAND
 * ============================================================================
 * This is the first file you edit when standing up a new client. Everything
 * user-facing reads from here: name, colors, copy, contact details, policy
 * language. Nothing is hard-coded anywhere else.
 *
 * Colors are emitted as CSS custom properties by `src/app/globals.css`, so a
 * palette change here re-themes the whole app — client portal, admin, emails.
 * ============================================================================
 */

export type VerticalKey =
  | 'hair_salon'
  | 'nail_salon'
  | 'med_spa'
  | 'massage'
  | 'barbershop'
  | 'lash_brow'
  | 'waxing'
  | 'tanning'
  | 'pet_grooming'
  | 'chiropractic'
  | 'physical_therapy'
  | 'dental'
  | 'personal_training'
  | 'auto_detailing'
  | 'generic';

export interface BrandConfig {
  /** Legal / display name. Appears in the header, emails, and receipts. */
  name: string;
  /** Short form for tight spaces (mobile nav, SMS sender line). */
  shortName: string;
  /** One-line positioning statement for the booking landing page. */
  tagline: string;
  /** Longer paragraph for the "about" block. */
  description: string;
  /** Which vertical preset to load service defaults + copy from. */
  vertical: VerticalKey;
  /** Used to scope the tenant row in the database. */
  slug: string;
  contact: {
    phone: string;
    email: string;
    /** Fully-qualified, no trailing slash. */
    website: string;
    instagram?: string;
    facebook?: string;
    tiktok?: string;
  };
  /** OKLCH triples. Tailwind v4 consumes these directly. */
  colors: {
    /** Primary action color — buttons, active states, links. */
    brand: string;
    brandForeground: string;
    /** Accent used sparingly for upsell/membership highlights. */
    accent: string;
    accentForeground: string;
    /** Page background + surfaces. */
    background: string;
    surface: string;
    /** Body text. */
    foreground: string;
    muted: string;
    border: string;
    success: string;
    warning: string;
    danger: string;
  };
  /** Radius scale. `sharp` for clinical/medical, `soft` for beauty. */
  radius: 'sharp' | 'soft' | 'round';
  /** Font stacks. Swap for a Google Font link in `globals.css` if desired. */
  fonts: {
    heading: string;
    body: string;
  };
  /** Paths under /public. Placeholder SVGs ship with the template. */
  assets: {
    logo: string;
    logoMark: string;
    ogImage: string;
    heroImage: string;
  };
  /** Copy overrides for the money moments. Tuned per vertical below. */
  copy: {
    bookCta: string;
    rebookCta: string;
    membershipName: string;
    membershipPitch: string;
    packageName: string;
    loyaltyName: string;
  };
}

export const brand: BrandConfig = {
  name: '123 Example Studio',
  shortName: 'Example Studio',
  tagline: 'Book your next visit before you leave.',
  description:
    '123 Example Studio is a placeholder business used to demonstrate this template. ' +
    'Replace this copy, the logo, and the color palette in src/config/brand.ts to ' +
    'stand up a real location.',
  vertical: 'generic',
  slug: 'example-studio',

  contact: {
    phone: '(555) 010-0123',
    email: 'hello@example-studio.test',
    website: 'https://example-studio.test',
    instagram: '@example.studio',
  },

  colors: {
    brand: 'oklch(0.52 0.13 250)',
    brandForeground: 'oklch(0.99 0 0)',
    accent: 'oklch(0.70 0.15 45)',
    accentForeground: 'oklch(0.20 0.02 45)',
    background: 'oklch(0.99 0.002 250)',
    surface: 'oklch(1 0 0)',
    foreground: 'oklch(0.22 0.015 250)',
    muted: 'oklch(0.55 0.012 250)',
    border: 'oklch(0.91 0.005 250)',
    success: 'oklch(0.62 0.13 155)',
    warning: 'oklch(0.75 0.14 75)',
    danger: 'oklch(0.58 0.19 25)',
  },

  radius: 'soft',

  fonts: {
    heading: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    body: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },

  assets: {
    logo: '/brand/logo.svg',
    logoMark: '/brand/logo-mark.svg',
    ogImage: '/brand/og.svg',
    heroImage: '/brand/hero.svg',
  },

  copy: {
    bookCta: 'Book appointment',
    rebookCta: 'Book my next visit',
    membershipName: 'Membership',
    membershipPitch: 'Lock in your spot every month and save on every visit.',
    packageName: 'Package',
    loyaltyName: 'Rewards',
  },
};

/** Radius token values, resolved from `brand.radius`. */
export const radiusScale: Record<BrandConfig['radius'], string> = {
  sharp: '0.25rem',
  soft: '0.75rem',
  round: '1.5rem',
};
