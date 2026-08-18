-- ============================================================================
-- 0012 — CRON RUN LOG
-- ============================================================================
-- One row per scheduled job, recording when it last ran and how it went.
--
-- This exists because the seven automations run behind a single dispatcher
-- (see src/lib/cron-jobs/index.ts). The dispatcher decides what is due by
-- comparing `last_run_at` against each job's minimum interval, which lets the
-- same code behave correctly whether the platform trigger fires once a day or
-- every fifteen minutes.
--
-- It doubles as the answer to "did the automations actually run last night?",
-- which is otherwise guesswork once a deployment is live.
-- ============================================================================

create table cron_runs (
  key               text primary key,
  last_run_at       timestamptz,
  last_status       text,               -- 'ok' | 'error' | 'running'
  last_duration_ms  integer,
  last_summary      jsonb,
  last_error        text,
  run_count         integer not null default 0,
  error_count       integer not null default 0,
  updated_at        timestamptz not null default now()
);

comment on table cron_runs is
  'Last-run bookkeeping for the scheduled automations. Written only by the service role via /api/cron/run.';

create index on cron_runs (last_run_at);

alter table cron_runs enable row level security;

-- Managers can see whether the automations are healthy; nobody writes to this
-- from a browser. The dispatcher uses the service-role key, which bypasses RLS.
create policy "managers read cron runs" on cron_runs
  for select using (auth_is_manager());

select attach_updated_at('cron_runs');
