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
    // Deep eucalyptus and warm gold. Chosen to look considered out of the box
    // for a salon or med spa — swap per client, but do not swap back to a
    // default blue, which reads like software rather than a place you visit.
    brand: 'oklch(0.42 0.062 168)',
    brandForeground: 'oklch(0.99 0.004 90)',
    accent: 'oklch(0.70 0.098 76)',
    accentForeground: 'oklch(0.24 0.03 76)',
    background: 'oklch(0.982 0.004 84)',
    surface: 'oklch(1 0 0)',
    foreground: 'oklch(0.215 0.010 62)',
    muted: 'oklch(0.535 0.011 66)',
    border: 'oklch(0.905 0.006 74)',
    success: 'oklch(0.62 0.13 155)',
    warning: 'oklch(0.75 0.14 75)',
    danger: 'oklch(0.58 0.19 25)',
  },

  radius: 'soft',

  fonts: {
    // A serif display against a warm sans is what separates a booking app that
    // looks designed from one that looks generated. Swap per client; keep the
    // pairing principle.
    heading: 'var(--font-display), "Iowan Old Style", Georgia, serif',
    body: 'var(--font-sans), system-ui, -apple-system, "Segoe UI", sans-serif',
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
