/**
 * ============================================================================
 * SHARED FOUNDATION
 * ============================================================================
 * The files that must be identical in repeatbiztemplate and
 * repeatbizadmintemplate.
 *
 * The two apps are separate products with separate deployments, but they read
 * one database and render one design system, so a large slice of src/ has to
 * agree. They are copied rather than extracted into a package: every client
 * gets their own fork of both repos, and a shared package would be a third
 * thing to version and publish for a two-app product.
 *
 * Copying is only safe if drift is visible. `npm run shared:check` fails when
 * any file below differs; `npm run shared:pull` copies the canonical version
 * over this repo's.
 *
 * CANONICAL is the client template. Not arbitrary — it is where the booking
 * engine, the retention rules and the message templates actually live, so it
 * is where a change to any of them naturally lands first.
 * ============================================================================
 */

export const CANONICAL = 'repeatbiztemplate';

/** Directories and files that must match, byte for byte. */
export const SHARED = [
  'src/components/ui',
  'src/config',
  'src/types',
  'src/lib/booking',
  'src/lib/messaging',
  'src/lib/retention',
  'src/lib/stripe',
  'src/lib/supabase',
  'src/lib/brand.ts',
  'src/lib/cron.ts',
  'src/lib/demo.ts',
  'src/lib/rules.ts',
  'src/lib/setup-mode.ts',
  'src/lib/url.ts',
  'src/lib/utils.ts',
];

/**
 * Files inside SHARED that are deliberately different, with the reason.
 *
 * Every entry here is a decision someone made on purpose. If a file is
 * different and is not listed, that is drift, and drift in a copied foundation
 * is how two codebases quietly stop being the same product.
 */
export const DIVERGENT = {
  'src/lib/supabase/middleware.ts':
    'Different auth models. The client app gates /account and lets a guest ' +
    'book; the back office gates everything but /login via an allow-list.',
};

/** Not shared at all — each app has its own, and they look nothing alike. */
export const NOT_SHARED = [
  'src/app/globals.css',
  'src/middleware.ts',
];
