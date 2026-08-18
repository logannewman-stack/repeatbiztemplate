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

const ADMIN_PREFIX = '/admin';
const ACCOUNT_PREFIX = '/account';

/**
 * Refreshes the auth session on every request and gates the protected areas.
 *
 * Two behaviors worth being explicit about:
 *
 *   1. Demo mode (no Supabase configured) leaves /admin open. There is no
 *      database, so the dashboard is rendering hard-coded illustrative
 *      figures and there is nothing to protect. Every admin page shows a
 *      "demo data" banner in this state.
 *
 *   2. Once Supabase IS configured, this fails CLOSED. Any error evaluating
 *      the session — network failure, expired token, misconfigured keys —
 *      redirects to sign-in rather than falling through. An auth check that
 *      cannot run is not an auth check that passed.
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needsAuth =
    path.startsWith(ADMIN_PREFIX) || path.startsWith(ACCOUNT_PREFIX);

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

    if (path.startsWith(ADMIN_PREFIX)) {
      const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle();

      if (staffError) return signIn();

      if (!staff) {
        // Signed in, but not staff. Send them to their own portal rather than
        // to a login screen they have already passed.
        const url = request.nextUrl.clone();
        url.pathname = '/account';
        url.search = '';
        return NextResponse.redirect(url);
      }
    }

    return response;
  } catch {
    // Fail closed on anything unexpected.
    return needsAuth ? signIn() : response;
  }
}
