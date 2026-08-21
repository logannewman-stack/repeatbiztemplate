import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

/** Mirrors `isSupabaseConfigured` in src/lib/demo.ts, inlined to keep the
 *  middleware bundle free of anything it does not need. */
function supabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes('REPLACE_ME'));
}

const ACCOUNT_PREFIX = '/account';

/**
 * Refreshes the auth session on every request and gates the client's own area.
 *
 * There is no staff surface in this app any more — the back office is a
 * separate deployment on its own domain, with its own middleware and its own
 * sign-in. Nothing here should ever grow a `/admin` branch again; that is the
 * whole point of the split.
 *
 * Two behaviors worth being explicit about:
 *
 *   1. Demo mode (no Supabase configured) leaves /account open. There is no
 *      database, so those screens render illustrative sample data and there
 *      is nothing to protect.
 *
 *   2. Once Supabase IS configured, this fails CLOSED. Any error evaluating
 *      the session — network failure, expired token, misconfigured keys —
 *      redirects to sign-in rather than falling through. An auth check that
 *      cannot run is not an auth check that passed.
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needsAuth = path.startsWith(ACCOUNT_PREFIX);

  if (!supabaseConfigured()) {
    if (needsAuth) {
      // Make the unauthenticated state visible to the page rather than silent.
      const response = NextResponse.next({ request });
      response.headers.set('x-demo-mode', '1');
      return response;
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const signIn = () => {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  };

  try {
    // Do not remove: this call is what refreshes an expiring session.
    const { data: { user }, error } = await supabase.auth.getUser();

    if (!needsAuth) return response;
    if (error || !user) return signIn();

    return response;
  } catch {
    // Fail closed on anything unexpected.
    return needsAuth ? signIn() : response;
  }
}
