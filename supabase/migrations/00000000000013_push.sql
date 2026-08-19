-- ============================================================================
-- 0013 — WEB PUSH
-- ============================================================================
-- Two things the push channel needs that nothing else in the schema provides:
-- somewhere to keep a browser's push subscription, and a way to tell a
-- reminder apart from an offer.
--
-- The second one matters more than it looks. Transactional notifications open
-- at roughly 69%; promotional ones at 3–5%, and clients receiving more than
-- six notifications a week from one sender are markedly more likely to
-- uninstall. So the send path enforces a weekly budget that promotional
-- messages draw from and transactional messages do not. That rule needs a
-- column to read, not a convention someone has to remember.
-- ============================================================================

-- --- Subscriptions ----------------------------------------------------------
-- One row per browser per client. A person with a phone and a laptop has two,
-- and both should ring.

create table push_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,

  -- The push service URL. Unique globally: the browser mints one per
  -- subscription, and re-subscribing after a permission reset yields a new
  -- one, so this is the natural identity.
  endpoint          text not null,
  -- Keys from PushSubscription.getKey(), base64url. Used to encrypt payloads
  -- so the push service itself cannot read them.
  p256dh            text not null,
  auth              text not null,

  -- Debugging aid: "which of my devices is this?" is otherwise unanswerable.
  user_agent        text,
  -- Set when the app last confirmed this subscription still exists. iOS
  -- expires subscriptions silently after long inactivity, so a stale row is
  -- expected rather than exceptional.
  last_seen_at      timestamptz not null default now(),
  -- A push service returning 404/410 means gone for good; anything else may
  -- be transient. Counted so a flaky endpoint is retired rather than retried
  -- forever.
  failure_count     integer not null default 0,
  last_failed_at    timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (endpoint)
);

comment on table push_subscriptions is
  'Web Push endpoints. On iOS these only exist for an app installed to the Home Screen.';

create index on push_subscriptions (business_id, client_id);
create index on push_subscriptions (last_seen_at);

alter table push_subscriptions enable row level security;

-- A client may see and delete their own devices; staff may read them to
-- answer "did the reminder actually have anywhere to go?".
create policy "clients manage own push subscriptions" on push_subscriptions
  for all using (
    client_id in (
      select id from clients
      where user_id = auth.uid()
    )
  );

create policy "staff read push subscriptions" on push_subscriptions
  for select using (business_id = auth_business_id());

select attach_updated_at('push_subscriptions');

-- --- Transactional vs promotional -------------------------------------------

alter table campaigns
  add column transactional boolean not null default false;

comment on column campaigns.transactional is
  'True for messages about an appointment or account that already exists. These bypass the weekly notification budget; promotional messages draw from it.';

-- Seed the split from what each trigger actually is. A reminder about a
-- booking someone made is not marketing; a winback offer is.
update campaigns set transactional = true
where trigger_type in (
  'appointment_booked',
  'appointment_reminder',
  'appointment_completed',
  'membership_welcome',
  'membership_dunning',
  'membership_credit_expiring',
  'package_expiring'
);

-- --- Weekly notification budget ---------------------------------------------

-- How many promotional messages a client has received in the trailing week,
-- across every channel. One budget, not one per channel: from the client's
-- side push, SMS and email are all "this business contacted me again".
create or replace function promotional_sends_this_week(p_client_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from campaign_sends s
  left join campaigns c on c.id = s.campaign_id
  where s.client_id = p_client_id
    and s.sent_at is not null
    and s.sent_at > now() - interval '7 days'
    and coalesce(c.transactional, false) = false;
$$;

comment on function promotional_sends_this_week is
  'Trailing-7-day promotional message count for one client, all channels combined.';
