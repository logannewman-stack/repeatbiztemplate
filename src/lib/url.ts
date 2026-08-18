/**
 * ============================================================================
 * APP URL
 * ============================================================================
 * One safe answer to "what is this deployment's public origin?".
 *
 * This exists because the naive version — `new URL(process.env.NEXT_PUBLIC_APP_URL)`
 * — fails the entire production build, not the request. Next.js evaluates the
 * root layout's `generateMetadata` while prerendering static pages, so a value
 * that `new URL()` rejects throws inside a Server Component render and the
 * build exits 1 with a digest and no usable message.
 *
 * The values that do that are exactly the ones a person types by hand:
 *
 *     example.vercel.app          no protocol      -> TypeError
 *     ""                          set but empty    -> TypeError  (?? does not catch this)
 *     " https://example.com "     pasted whitespace -> TypeError
 *
 * So nothing here is allowed to throw. A missing or malformed value degrades to
 * the next candidate, and the last candidate always parses.
 * ============================================================================
 */

/** Parse loosely, return an origin, or null. Never throws. */
function toOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;

  // Do not strip trailing slashes here: it would turn "https://" into
  // "https:", which then fails the protocol test below and gets re-prefixed
  // into the host "https". URL.origin has no trailing slash anyway.
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Vercel's system variables are bare hosts (`example.vercel.app`), and a
  // hand-entered value usually is too. Assume https rather than reject.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The public origin, with no trailing slash — e.g. `https://example.com`.
 *
 * In preference order:
 *   1. NEXT_PUBLIC_APP_URL             what the operator set deliberately
 *   2. VERCEL_PROJECT_PRODUCTION_URL   the project's stable production domain
 *   3. VERCEL_URL                      this specific deployment
 *   4. http://localhost:3000           local dev
 *
 * 2 and 3 mean a fork deploys with working email and text links before anyone
 * has configured anything.
 */
export function resolveAppUrl(): string {
  return (
    toOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    toOrigin(process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL) ??
    toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    toOrigin(process.env.NEXT_PUBLIC_VERCEL_URL) ??
    toOrigin(process.env.VERCEL_URL) ??
    'http://localhost:3000'
  );
}

/** `resolveAppUrl()` joined with a path. Safe for Stripe redirect URLs. */
export function appUrl(path = ''): string {
  if (!path) return resolveAppUrl();
  return `${resolveAppUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** True when the origin is a real one, not the localhost fallback. */
export function hasPublicAppUrl(): boolean {
  return !resolveAppUrl().includes('localhost');
}

export const __test = { toOrigin };
