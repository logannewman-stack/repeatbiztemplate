/**
 * ============================================================================
 * CRON JOB REGISTRY
 * ============================================================================
 * Vercel's Hobby plan allows two cron jobs, daily only. This platform has
 * seven, three of them sub-daily, so declaring them individually in
 * `vercel.json` makes the whole deployment fail before it starts.
 *
 * So they are declared here instead and driven by one dispatcher at
 * `/api/cron/run`. `vercel.json` needs a single entry, which deploys on any
 * plan. Each job carries a `minIntervalMinutes`; the dispatcher runs whatever
 * is due, so the same code behaves correctly whether the dispatcher fires
 * once a day (Hobby) or every fifteen minutes (Pro).
 *
 * Every job stays individually reachable at `/api/cron/<key>` for manual runs,
 * for an external scheduler, or for a Pro account that prefers separate entries.
 * ============================================================================
 */

import type { CronSummary } from '@/lib/cron';

export interface CronJob {
  key: string;
  label: string;
  /** Minimum gap between runs. The dispatcher skips a job seen more recently. */
  minIntervalMinutes: number;
  /** What a client actually loses if this job runs late. */
  latencyCost: string;
  run: () => Promise<CronSummary>;
}

export const CRON_JOBS: CronJob[] = [
  {
    key: 'reminders',
    label: 'Appointment reminders',
    minIntervalMinutes: 60,
    latencyCost:
      'Reminders go out late or not at all, and unconfirmed appointments no-show more.',
    run: async () => (await import('./reminders')).run(),
  },
  {
    key: 'waitlist-fill',
    label: 'Waitlist fill',
    minIntervalMinutes: 15,
    latencyCost:
      'A freed slot sits empty instead of being offered to someone waiting.',
    run: async () => (await import('./waitlist-fill')).run(),
  },
  {
    key: 'rebooking-nudges',
    label: 'Rebooking nudges',
    minIntervalMinutes: 60 * 20,
    latencyCost: 'Clients past their usual interval are not chased on time.',
    run: async () => (await import('./rebooking-nudges')).run(),
  },
  {
    key: 'review-requests',
    label: 'Reviews and follow-ups',
    minIntervalMinutes: 60 * 20,
    latencyCost:
      'First-visit follow-ups and review asks drift past the window where they work.',
    run: async () => (await import('./review-requests')).run(),
  },
  {
    key: 'membership-health',
    label: 'Membership health',
    minIntervalMinutes: 60 * 20,
    latencyCost:
      'Paused memberships resume late and expiring credits go unwarned.',
    run: async () => (await import('./membership-health')).run(),
  },
  {
    key: 'winback',
    label: 'Winback',
    minIntervalMinutes: 60 * 24 * 7,
    latencyCost: 'Lapsed clients wait longer for an offer. Rarely urgent.',
    run: async () => (await import('./winback')).run(),
  },
  {
    key: 'refresh-metrics',
    label: 'Refresh client metrics',
    minIntervalMinutes: 60 * 20,
    latencyCost:
      'Clients who became due purely because a day passed do not enter the retention queue.',
    run: async () => (await import('./refresh-metrics')).run(),
  },
];

export function findJob(key: string): CronJob | undefined {
  return CRON_JOBS.find((job) => job.key === key);
}
