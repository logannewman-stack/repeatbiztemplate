-- ============================================================================
-- 0002 — CORE TENANCY: businesses, locations, rooms, staff, schedules
-- ============================================================================
-- The template is multi-tenant-capable but ships single-tenant. One row in
-- `businesses` per forked deployment is the normal case; the extra dimension
-- costs nothing and means a client who opens a second brand doesn't need a
-- migration.
-- ============================================================================

create table businesses (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  legal_name        text,
  vertical          text not null default 'generic',
  timezone          text not null default 'America/New_York',
  currency          char(3) not null default 'USD',
  locale            text not null default 'en-US',

  -- Branding overrides. Falls back to src/config/brand.ts when null.
  branding          jsonb not null default '{}'::jsonb,
  -- Runtime overrides for src/config/rules.ts. Deep-merged at read time.
  policy            jsonb not null default '{}'::jsonb,
  -- Feature toggles per business.
  features          jsonb not null default '{}'::jsonb,

  stripe_customer_id      text,
  stripe_account_id       text,          -- if using Stripe Connect
  tax_rate_bps            integer not null default 0,   -- basis points

  onboarding_completed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column businesses.policy is
  'Deep-merged over src/config/rules.ts at runtime so owners can tune cancellation windows, deposits, and rebooking cadence without a redeploy.';

create table locations (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  name              text not null,
  slug              text not null,
  timezone          text,                -- null → inherit business timezone
  phone             text,
  email             citext,
  address_line1     text,
  address_line2     text,
  city              text,
  region            text,
  postal_code       text,
  country           char(2) not null default 'US',
  latitude          numeric(9,6),
  longitude         numeric(9,6),

  -- [{ weekday: 0-6, open: '09:00', close: '18:00', closed: false }, ...]
  hours             jsonb not null default '[]'::jsonb,
  -- [{ date: '2026-12-25', closed: true, note: 'Holiday' }, ...]
  hour_overrides    jsonb not null default '[]'::jsonb,

  booking_enabled   boolean not null default true,
  sort_order        integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, slug)
);

create index on locations (business_id) where active;

-- Physical capacity: chairs, rooms, beds, bays, wash stations, laser units.
-- A service can require a room of a given kind; the availability engine will
-- not double-book one.
create table rooms (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  location_id       uuid not null references locations(id) on delete cascade,
  name              text not null,
  kind              text not null default 'standard',
  capacity          integer not null default 1 check (capacity > 0),
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on rooms (location_id) where active;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

create table staff (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  -- Links to Supabase Auth. Null for providers who never log in.
  user_id           uuid unique references auth.users(id) on delete set null,
  role              staff_role not null default 'provider',

  display_name      text not null,
  title             text,                    -- 'Senior Stylist', 'Nurse Injector'
  bio               text,
  avatar_url        text,
  email             citext,
  phone             text,

  -- Providers are bookable; front desk / managers usually are not.
  bookable          boolean not null default true,
  accepts_new_clients boolean not null default true,
  -- Per-provider price multiplier for level-based pricing (a master stylist
  -- charges more for the same service). 1.00 = base price.
  price_multiplier  numeric(5,3) not null default 1.000 check (price_multiplier > 0),
  commission_rate   numeric(5,4) not null default 0 check (commission_rate between 0 and 1),

  -- Minutes between this provider's appointments, overriding the business default.
  buffer_after_min  integer,
  color             text,                    -- calendar chip color
  sort_order        integer not null default 0,
  active            boolean not null default true,
  hired_on          date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on staff (business_id) where active;
create index on staff (user_id);

create table staff_locations (
  staff_id          uuid not null references staff(id) on delete cascade,
  location_id       uuid not null references locations(id) on delete cascade,
  primary key (staff_id, location_id)
);

-- Recurring weekly availability. Multiple rows per weekday allow split shifts.
create table staff_schedules (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references staff(id) on delete cascade,
  location_id       uuid not null references locations(id) on delete cascade,
  weekday           smallint not null check (weekday between 0 and 6),  -- 0 = Sunday
  start_time        time not null,
  end_time          time not null,
  effective_from    date not null default current_date,
  effective_to      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_time > start_time)
);

create index on staff_schedules (staff_id, weekday);

-- Vacation, sick days, lunch breaks, admin blocks.
create table staff_time_off (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references staff(id) on delete cascade,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  reason            text,
  all_day           boolean not null default false,
  -- 'none' | 'daily' | 'weekly' — recurring lunch breaks etc.
  recurrence        text not null default 'none',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index on staff_time_off (staff_id, starts_at, ends_at);

-- Business-wide closures (holidays, private events) that block all providers.
create table blocked_times (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  location_id       uuid references locations(id) on delete cascade,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  reason            text,
  created_at        timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index on blocked_times (business_id, starts_at, ends_at);

select attach_updated_at('businesses');
select attach_updated_at('locations');
select attach_updated_at('rooms');
select attach_updated_at('staff');
select attach_updated_at('staff_schedules');
select attach_updated_at('staff_time_off');
