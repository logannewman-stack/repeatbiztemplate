import { NextResponse, type NextRequest } from 'next/server';
import { authorizeCron } from '@/lib/cron';
import { isSupabaseConfigured } from '@/lib/demo';
import { run } from '@/lib/cron-jobs/reminders';

/**
 * Appointment reminders.
 *
 * Thin wrapper so this job stays individually reachable — for a manual run, an
 * external scheduler, or a Vercel plan that can afford separate cron entries.
 * On the default deployment `/api/cron/run` drives it instead, because Hobby
 * allows only two cron jobs and this platform has seven.
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase is not configured, so there is nothing to run.' },
      { status: 503 }
    );
  }

  try {
    return NextResponse.json(await run());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Job failed.' },
      { status: 500 }
    );
  }
}
