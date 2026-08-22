import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeCron } from '@/lib/cron';
import { CRON_JOBS, findJob, type CronJob } from '@/lib/cron-jobs';
import { isSupabaseConfigured } from '@/lib/demo';

/**
 * ============================================================================
 * CRON DISPATCHER
 * ============================================================================
 * The single entry point `vercel.json` schedules. It runs whichever jobs are
 * due, which is what lets one platform trigger drive eight automations on any
 * Vercel plan — Hobby allows two cron jobs at daily granularity, and declaring
 * four sub-daily ones fails the deployment outright.
 *
 * Due-ness comes from `cron_runs.last_run_at` versus each job's minimum
 * interval, so firing this hourly on Pro and daily on Hobby both do the right
 * thing without a code change.
 *
 * Jobs run sequentially and each is wrapped: one failing automation must not
 * take the rest of the night's work down with it.
 * ============================================================================
 */

// Long enough for a real client list, low enough for Hobby's 60s ceiling.
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

  const startedAt = Date.now();
  const supabase = createAdminClient();

  // `?jobs=winback,reminders` forces a subset regardless of when it last ran.
  const requested = request.nextUrl.searchParams.get('jobs');
  const force = request.nextUrl.searchParams.get('force') === '1';

  let queue: CronJob[];
  if (requested) {
    queue = requested
      .split(',')
      .map((key) => findJob(key.trim()))
      .filter((job): job is CronJob => Boolean(job));

    if (queue.length === 0) {
      return NextResponse.json(
        { error: 'No matching jobs.', available: CRON_JOBS.map((j) => j.key) },
        { status: 400 }
      );
    }
  } else {
    queue = CRON_JOBS;
  }

  const { data: previous } = await supabase
    .from('cron_runs')
    .select('key, last_run_at, run_count, error_count');

  const previousByKey = new Map((previous ?? []).map((row) => [row.key, row]));

  const ran: Array<Record<string, unknown>> = [];
  const skipped: Array<{ key: string; reason: string; nextDueAt: string }> = [];

  for (const job of queue) {
    const history = previousByKey.get(job.key);
    const lastRun = history?.last_run_at;

    if (!force && !requested && lastRun) {
      const minutesSince = (Date.now() - new Date(lastRun).getTime()) / 60_000;
      if (minutesSince < job.minIntervalMinutes) {
        skipped.push({
          key: job.key,
          reason: 'not_due',
          nextDueAt: new Date(
            new Date(lastRun).getTime() + job.minIntervalMinutes * 60_000
          ).toISOString(),
        });
        continue;
      }
    }

    const jobStartedAt = Date.now();
    try {
      const summary = await job.run();

      await supabase.from('cron_runs').upsert(
        {
          key: job.key,
          last_run_at: new Date().toISOString(),
          last_status: 'ok',
          last_duration_ms: Date.now() - jobStartedAt,
          last_summary: summary as never,
          last_error: null,
          // Upsert overwrites, so increment from what we read rather than
          // passing a literal — otherwise the counter sticks at 1 forever.
          run_count: (history?.run_count ?? 0) + 1,
          error_count: history?.error_count ?? 0,
        },
        { onConflict: 'key' }
      );

      ran.push({ key: job.key, ...summary });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await supabase.from('cron_runs').upsert(
        {
          key: job.key,
          last_run_at: new Date().toISOString(),
          last_status: 'error',
          last_duration_ms: Date.now() - jobStartedAt,
          last_error: message,
          run_count: (history?.run_count ?? 0) + 1,
          error_count: (history?.error_count ?? 0) + 1,
        },
        { onConflict: 'key' }
      );

      // Keep going. One broken automation should not cost the others a night.
      ran.push({ key: job.key, error: message });
    }
  }

  return NextResponse.json({
    dispatcher: 'ok',
    ranCount: ran.length,
    skippedCount: skipped.length,
    durationMs: Date.now() - startedAt,
    ran,
    skipped,
  });
}
