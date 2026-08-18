import { NextResponse, type NextRequest } from 'next/server';

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without this check
 * anyone who finds the URL could fire the whole messaging pipeline at will.
 */
export function authorizeCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Refuse rather than run wide open. A cron that cannot authenticate is a
    // misconfiguration, not a reason to skip the check.
    return NextResponse.json(
      { error: 'CRON_SECRET is not set. Refusing to run an unauthenticated job.' },
      { status: 500 }
    );
  }

  const header = request.headers.get('authorization');
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  return null;
}

export interface CronSummary {
  job: string;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  durationMs: number;
  details?: Record<string, unknown>;
}

export function summarize(
  job: string,
  startedAt: number,
  results: Array<{ status: string }>,
  details?: Record<string, unknown>
): CronSummary {
  return {
    job,
    processed: results.length,
    sent: results.filter((r) => r.status === 'sent').length,
    skipped: results.filter((r) => r.status === 'skipped' || r.status === 'duplicate').length,
    failed: results.filter((r) => r.status === 'failed').length,
    durationMs: Date.now() - startedAt,
    details,
  };
}
