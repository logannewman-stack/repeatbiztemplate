import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Exchanges the magic-link code for a session, then links the auth user to
 * their existing client record. Guest bookings create a client row with no
 * `user_id`; this is where that row becomes their account rather than a
 * duplicate being created alongside it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/account';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_code`);
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (user?.email) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id, user_id')
      .eq('email', user.email)
      .is('user_id', null)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('clients')
        .update({ user_id: user.id })
        .eq('id', existing.id);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
