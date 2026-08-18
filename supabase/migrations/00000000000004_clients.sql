-- ============================================================================
-- 0004 — CLIENTS & CRM
-- ============================================================================
-- `client_metrics` is a denormalized rollup refreshed by trigger and by the
-- nightly cron. Every retention query in the app reads from it, so keeping it
-- materialized rather than computing on the fly is what makes the dashboard
-- and the campaign engine fast enough to run on a hobby-tier database.
-- ============================================================================

create table clients (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  -- Set once the client creates a portal login. Guest bookings leave it null.
  user_id           uuid references auth.users(id) on delete set null,

  first_name        text not null,
  last_name         text,
  email             citext,
  phone             text,
  birthday          date,
  pronouns          text,

  -- Preferences that make one-tap rebooking possible ---------------------
  preferred_staff_id    uuid references staff(id) on delete set null,
  preferred_location_id uuid references locations(id) on delete set null,
  -- Free text: 'Saturday mornings', 'after 5pm weekdays'
  preferred_time_note   text,

  -- Consent / compliance --------------------------------------------------
  marketing_opt_in  boolean not null default false,
  sms_opt_in        boolean not null default false,
  email_opt_in      boolean not null default true,
  opted_out_at      timestamptz,

  -- Commerce ---------------------------------------------------------------
  stripe_customer_id text,
  -- Card on file, required after repeated late cancels / no-shows.
  default_payment_method_id text,
  has_card_on_file  boolean not null default false,

  tags              text[] not null default '{}',
  source            text,                -- 'walk_in' | 'referral' | 'instagram' | ...
  referred_by_client_id uuid references clients(id) on delete set null,
  referral_code     text unique,

  -- Front-desk banner. Allergies, access needs, "always runs 10 min late".
  alert_note        text,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on clients (business_id) where archived_at is null;
create index on clients (business_id, email);
create index on clients (business_id, phone);
create index on clients (user_id);
create index clients_name_trgm on clients using gin ((first_name || ' ' || coalesce(last_name, '')) gin_trgm_ops);

-- One email should not appear twice inside a business.
create unique index clients_business_email_key
  on clients (business_id, email) where email is not null and archived_at is null;

-- ---------------------------------------------------------------------------
-- Denormalized retention metrics
-- ---------------------------------------------------------------------------

create table client_metrics (
  client_id         uuid primary key references clients(id) on delete cascade,
  business_id       uuid not null references businesses(id) on delete cascade,

  -- Volume ---------------------------------------------------------------
  visit_count       integer not null default 0,
  completed_count   integer not null default 0,
  cancelled_count   integer not null default 0,
  late_cancel_count integer not null default 0,
  no_show_count     integer not null default 0,
  reschedule_count  integer not null default 0,

  -- Money ----------------------------------------------------------------
  lifetime_value_cents      bigint not null default 0,
  service_revenue_cents     bigint not null default 0,
  retail_revenue_cents      bigint not null default 0,
  membership_revenue_cents  bigint not null default 0,
  tip_cents                 bigint not null default 0,
  avg_ticket_cents          integer not null default 0,
  -- Trailing 90-day spend. Drives the "you'd save with a membership" prompt.
  spend_90d_cents           integer not null default 0,
  spend_365d_cents          integer not null default 0,

  -- Cadence --------------------------------------------------------------
  first_visit_at    timestamptz,
  last_visit_at     timestamptz,
  -- The client's own average gap between visits — beats any global default.
  avg_days_between_visits numeric(8,2),
  -- last_visit_at + (personal cadence or service default)
  next_expected_at  timestamptz,
  -- The date they cross into "lapsed".
  lapse_at          timestamptz,
  -- Set when a future appointment exists. The core rebooking KPI.
  has_future_booking boolean not null default false,
  next_appointment_at timestamptz,

  -- Behavior scores ------------------------------------------------------
  -- 0-100. Higher = more likely to no-show. Drives deposit enforcement.
  no_show_risk      integer not null default 0 check (no_show_risk between 0 and 100),
  -- 0-100. Higher = more likely to churn. Drives winback priority.
  churn_risk        integer not null default 0 check (churn_risk between 0 and 100),
  -- Percent of completed visits that led to a booked next visit.
  rebook_rate       numeric(5,2) not null default 0,

  -- Loyalty --------------------------------------------------------------
  loyalty_points    integer not null default 0,
  loyalty_tier      text not null default 'Member',

  lifecycle         client_lifecycle not null default 'lead',
  computed_at       timestamptz not null default now()
);

create index on client_metrics (business_id, lifecycle);
create index on client_metrics (business_id, next_expected_at)
  where has_future_booking = false;
create index on client_metrics (business_id, churn_risk desc);
create index on client_metrics (business_id, lifetime_value_cents desc);

comment on table client_metrics is
  'Denormalized retention rollup. Refreshed by trigger on appointment/order writes and fully recomputed nightly by /api/cron/refresh-metrics.';

-- ---------------------------------------------------------------------------
-- Notes, files, forms
-- ---------------------------------------------------------------------------

create table client_notes (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  business_id       uuid not null references businesses(id) on delete cascade,
  staff_id          uuid references staff(id) on delete set null,
  appointment_id    uuid,                -- FK added in 0005 after appointments exists
  kind              note_kind not null default 'note',
  body              text not null,
  -- Formula notes: { color: '7N + 20vol', timing: '35 min', ... }
  structured        jsonb not null default '{}'::jsonb,
  -- Medical/consult notes stay hidden from the client portal.
  client_visible    boolean not null default false,
  pinned            boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on client_notes (client_id, created_at desc);

create table client_files (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  business_id       uuid not null references businesses(id) on delete cascade,
  appointment_id    uuid,
  storage_path      text not null,
  file_name         text,
  mime_type         text,
  size_bytes        bigint,
  -- 'before' | 'after' | 'inspiration' | 'document' | 'consent'
  kind              text not null default 'document',
  caption           text,
  client_visible    boolean not null default true,
  uploaded_by       uuid references staff(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index on client_files (client_id, created_at desc);

create table forms (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  name              text not null,
  -- 'intake' | 'consent' | 'consultation' | 'feedback'
  kind              text not null default 'intake',
  description       text,
  -- [{ id, label, type: 'text'|'textarea'|'select'|'checkbox'|'radio'|'date'|'signature',
  --    required: bool, options: [], helpText }]
  schema            jsonb not null default '[]'::jsonb,
  -- Re-ask after this many days (medical histories go stale).
  revalidate_days   integer,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table form_submissions (
  id                uuid primary key default gen_random_uuid(),
  form_id           uuid not null references forms(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  business_id       uuid not null references businesses(id) on delete cascade,
  appointment_id    uuid,
  answers           jsonb not null default '{}'::jsonb,
  signature_data    text,                -- data URL of the drawn signature
  signed_at         timestamptz,
  ip_address        inet,
  created_at        timestamptz not null default now()
);

create index on form_submissions (client_id, created_at desc);

select attach_updated_at('clients');
select attach_updated_at('client_notes');
select attach_updated_at('forms');
