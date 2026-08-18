-- ============================================================================
-- 0007 — RETENTION ENGINE: campaigns, sends, reviews, referrals, audit
-- ============================================================================
-- Every automated message the business sends is a `campaign` with a trigger.
-- Every attempt is a `campaign_send` row, and — critically — every send links
-- to the appointment it produced. Without that link you cannot tell which
-- automations pay for themselves.
-- ============================================================================

create table message_templates (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  key               text not null,
  name              text not null,
  channel           message_channel not null,
  subject           text,                -- email only
  body              text not null,       -- supports {{handlebars}} variables
  -- Which merge variables this template expects, for the editor's helper UI.
  variables         text[] not null default '{}',
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, key, channel)
);

comment on column message_templates.body is
  'Supports {{client.first_name}}, {{appointment.starts_at}}, {{business.name}}, {{link.confirm}}, {{link.rebook}}, {{offer.label}} and friends. See src/lib/messaging/render.ts.';

create table campaigns (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  key               text not null,
  name              text not null,
  description       text,
  trigger_type      campaign_trigger not null,

  -- Trigger-specific config, e.g.
  --   { "hoursBefore": 24 }                          appointment_reminder
  --   { "dayOffset": 5, "minVisits": 1 }             rebooking_nudge
  --   { "afterLapseDays": 30, "offerPct": 15 }       lapse_winback
  config            jsonb not null default '{}'::jsonb,

  channel           message_channel not null default 'sms',
  -- Falls back to this channel when the client hasn't opted into `channel`.
  fallback_channel  message_channel,
  template_key      text not null,

  -- Guardrails ------------------------------------------------------------
  -- Never send to the same client more than once per this many days.
  cooldown_days     integer not null default 0,
  -- Skip clients who already have a future booking. Almost always correct
  -- for nudges — nothing sours a good client like being chased when they've
  -- already rebooked.
  skip_if_future_booking boolean not null default true,
  skip_if_lapsed_beyond_days integer,
  -- Only fire for clients whose churn risk is at least this high.
  min_churn_risk    integer not null default 0,
  respect_quiet_hours boolean not null default true,
  -- Cap daily volume so a backfill doesn't blast the whole list.
  daily_send_cap    integer,

  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, key)
);

create index on campaigns (business_id, trigger_type) where active;

create table campaign_sends (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  campaign_id       uuid references campaigns(id) on delete set null,
  client_id         uuid not null references clients(id) on delete cascade,
  appointment_id    uuid references appointments(id) on delete set null,
  membership_id     uuid references memberships(id) on delete set null,

  channel           message_channel not null,
  status            send_status not null default 'scheduled',
  to_address        text,                -- email or E.164 phone, snapshotted
  subject           text,
  body              text,

  scheduled_for     timestamptz not null default now(),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  failed_at         timestamptz,
  error             text,
  -- Why the engine chose not to send. Invaluable when an owner asks
  -- "why didn't my client get the reminder?"
  skip_reason       text,

  -- Attribution -----------------------------------------------------------
  -- Set when a booking lands within the attribution window after this send.
  converted_at      timestamptz,
  converted_appointment_id uuid references appointments(id) on delete set null,
  conversion_value_cents integer not null default 0,

  provider_message_id text,
  -- Idempotency: one send per campaign per client per trigger occurrence.
  dedupe_key        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on campaign_sends (business_id, status, scheduled_for);
create index on campaign_sends (client_id, created_at desc);
create index on campaign_sends (campaign_id, sent_at desc);
create unique index campaign_sends_dedupe on campaign_sends (dedupe_key)
  where dedupe_key is not null;

alter table appointments
  add constraint appointments_attributed_send_fk
  foreign key (attributed_send_id) references campaign_sends(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Reviews — gated so unhappy clients reach the owner, not the public listing
-- ---------------------------------------------------------------------------

create table reviews (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  appointment_id    uuid references appointments(id) on delete set null,
  staff_id          uuid references staff(id) on delete set null,

  rating            smallint check (rating between 1 and 5),
  body              text,
  -- True once the client was forwarded to the public review platform.
  routed_public     boolean not null default false,
  -- Private feedback (rating below threshold) needing an owner response.
  needs_followup    boolean not null default false,
  followed_up_at    timestamptz,
  followup_note     text,

  requested_at      timestamptz,
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on reviews (business_id, submitted_at desc);
create index on reviews (business_id) where needs_followup and followed_up_at is null;

-- ---------------------------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------------------------

create table referrals (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  referrer_client_id uuid not null references clients(id) on delete cascade,
  referee_client_id uuid references clients(id) on delete set null,
  referee_email     citext,
  referee_phone     text,
  code              text not null,
  -- 'sent' | 'signed_up' | 'completed_visit' | 'rewarded' | 'expired'
  status            text not null default 'sent',
  referrer_reward_cents integer not null default 0,
  referee_reward_cents  integer not null default 0,
  qualifying_appointment_id uuid references appointments(id) on delete set null,
  rewarded_at       timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on referrals (business_id, status);
create index on referrals (referrer_client_id);

-- ---------------------------------------------------------------------------
-- Account credit — refunds, save offers, winback incentives, referral rewards
-- ---------------------------------------------------------------------------

create table account_credits (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  amount_cents      integer not null,
  balance_after     integer not null,
  reason            text not null,
  order_id          uuid references orders(id) on delete set null,
  referral_id       uuid references referrals(id) on delete set null,
  expires_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index on account_credits (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Offers — one-time incentives issued by the retention engine
-- ---------------------------------------------------------------------------

create table offers (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  client_id         uuid references clients(id) on delete cascade,
  code              text not null unique,
  label             text not null,
  -- 'percent' | 'flat' | 'addon' | 'free_month'
  kind              text not null,
  value             integer not null default 0,
  -- Restrict to specific services; empty = anything.
  service_ids       uuid[] not null default '{}',
  -- Which campaign issued it, for ROI reporting.
  campaign_id       uuid references campaigns(id) on delete set null,
  source            text,                -- 'rebook_incentive' | 'winback' | 'save_flow' | 'referral'
  max_redemptions   integer not null default 1,
  redemption_count  integer not null default 0,
  redeemed_at       timestamptz,
  redeemed_order_id uuid references orders(id) on delete set null,
  starts_at         timestamptz not null default now(),
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on offers (client_id) where redeemed_at is null;
create index on offers (business_id, source);

-- ---------------------------------------------------------------------------
-- System
-- ---------------------------------------------------------------------------

-- Stripe (and other provider) webhook idempotency.
create table webhook_events (
  id                text primary key,    -- provider event id
  provider          text not null default 'stripe',
  type              text not null,
  payload           jsonb,
  processed_at      timestamptz,
  error             text,
  received_at       timestamptz not null default now()
);

create table audit_log (
  id                bigserial primary key,
  business_id       uuid references businesses(id) on delete cascade,
  actor_user_id     uuid,
  actor_staff_id    uuid references staff(id) on delete set null,
  action            text not null,       -- 'appointment.cancelled', 'membership.paused'
  entity_type       text,
  entity_id         uuid,
  before            jsonb,
  after             jsonb,
  ip_address        inet,
  user_agent        text,
  created_at        timestamptz not null default now()
);

create index on audit_log (business_id, created_at desc);
create index on audit_log (entity_type, entity_id);

select attach_updated_at('message_templates');
select attach_updated_at('campaigns');
select attach_updated_at('campaign_sends');
select attach_updated_at('reviews');
select attach_updated_at('referrals');
select attach_updated_at('offers');
