'use client';

/**
 * Browser Supabase client. Subject to RLS — it can only ever see what the
 * policies in migration 0010 allow for the signed-in user (or anon).
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
