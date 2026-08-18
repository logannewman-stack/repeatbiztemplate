import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY.
 *
 * Only ever import this from:
 *   - route handlers under src/app/api/
 *   - server actions that have already authorized the caller
 *   - cron jobs
 *
 * Never import it into a Client Component or anything that ships to the
 * browser — the key grants unrestricted read/write to every tenant's data.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Copy .env.example to .env.local and fill it in.'
    );
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
