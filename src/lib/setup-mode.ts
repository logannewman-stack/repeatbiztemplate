/**
 * ============================================================================
 * SETUP MODE
 * ============================================================================
 * Who is looking at this build, and therefore whether it should admit that it
 * has no database yet.
 *
 * The same demo build serves two people with opposite needs:
 *
 *   a developer standing up a fork, who has to know nothing is wired up and
 *   needs pointing at SETUP.md
 *
 *   a salon owner being shown "this is what your clients would see", for whom
 *   a banner reading "Demo mode — see SETUP.md" is the moment it stops looking
 *   like a product and starts looking like a half-built one
 *
 * So the hints are on in development and off in a production build, which maps
 * exactly onto how each person arrives: `npm run dev` on a laptop, versus a
 * deployed URL opened in a meeting. `NEXT_PUBLIC_SETUP_HINTS` overrides it
 * either way — set it to 1 on the deployment while configuring a real client,
 * and remove it before they see it.
 *
 * The developer signal does not disappear, it moves: demo mode still logs a
 * loud warning server-side, which a developer sees in their terminal and a
 * prospect never sees at all.
 * ============================================================================
 */

type Env = { NEXT_PUBLIC_SETUP_HINTS?: string; NODE_ENV?: string };

/**
 * Takes the environment as an argument so this is testable without mutating
 * globals — `NODE_ENV` is read-only in a lot of runtimes and faking it is how
 * a test suite starts lying.
 */
export function isSetupMode(env: Env = process.env): boolean {
  const explicit = env.NEXT_PUBLIC_SETUP_HINTS;

  // An unset variable in a hosting dashboard often arrives as "", which must
  // not read as an explicit "off".
  if (explicit != null && explicit !== '') {
    return explicit !== '0' && explicit.toLowerCase() !== 'false';
  }

  return env.NODE_ENV === 'development';
}

/** The inverse, named for what it protects. */
export function isPresentationMode(env: Env = process.env): boolean {
  return !isSetupMode(env);
}

/**
 * A demo build being shown to a prospect: no database, and setup hints off.
 *
 * This is the state where the app has to read as a finished product rather
 * than a template being configured. It is deliberately narrower than "demo
 * mode" — a developer running `npm run dev` is also in demo mode, and they
 * want every hint they can get.
 */
export function isSalesDemo(
  supabaseConfigured: boolean, env: Env = process.env
): boolean {
  return !supabaseConfigured && !isSetupMode(env);
}
