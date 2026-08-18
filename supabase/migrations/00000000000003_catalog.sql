-- ============================================================================
-- 0003 — CATALOG: services, add-ons, products, packages
-- ============================================================================
-- `rebook_interval_days` on a service is the single most valuable column in
-- this schema. It powers the pre-selected date on the rebooking prompt, the
-- "due for a visit" query, and the lapse threshold.
-- ============================================================================

create table service_categories (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  name              text not null,
  description       text,
  sort_order        integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table services (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  category_id       uuid references service_categories(id) on delete set null,

  name              text not null,
  slug              text not null,
  description       text,
  image_url         text,

  -- Timing --------------------------------------------------------------
  duration_min      integer not null check (duration_min > 0),
  -- Gap in the middle of the service where the provider is free (hair color
  -- developing, laser cooling, mask setting). With
  -- rules.booking.allowProcessingTimeOverlap the engine books another client
  -- into this window — the biggest capacity unlock available to a color salon.
  processing_time_min integer not null default 0 check (processing_time_min >= 0),
  -- Minutes of provider work AFTER the processing gap.
  finish_time_min   integer not null default 0 check (finish_time_min >= 0),
  buffer_before_min integer,
  buffer_after_min  integer,

  -- Pricing -------------------------------------------------------------
  price_cents       integer not null default 0 check (price_cents >= 0),
  -- What a member pays. Null → derive from the plan's discount_pct.
  member_price_cents integer check (member_price_cents >= 0),
  -- 'fixed' | 'from' | 'consultation' — "from $X" for variable-length work.
  price_type        text not null default 'fixed',
  cost_cents        integer not null default 0,  -- product cost, for margin reporting
  taxable           boolean not null default true,

  -- Deposits ------------------------------------------------------------
  deposit_mode      deposit_mode not null default 'none',
  deposit_flat_cents integer not null default 0,
  deposit_percent   integer not null default 0 check (deposit_percent between 0 and 100),

  -- Retention -----------------------------------------------------------
  -- Ideal days until the next visit for this service. Drives everything.
  rebook_interval_days integer not null default 30 check (rebook_interval_days > 0),
  -- Acceptable slack around the ideal date before a client counts as "due".
  rebook_window_days integer not null default 7,

  -- Booking rules -------------------------------------------------------
  online_bookable   boolean not null default true,
  requires_consultation boolean not null default false,
  requires_intake_form boolean not null default false,
  requires_consent_form boolean not null default false,
  new_clients_only  boolean not null default false,
  existing_clients_only boolean not null default false,
  -- Room kind this service needs; null = no room required.
  required_room_kind text,
  max_per_day       integer,             -- capacity cap across all providers

  sort_order        integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, slug)
);

create index on services (business_id) where active and online_bookable;
create index on services (category_id);

comment on column services.rebook_interval_days is
  'Ideal days until the next visit. Pre-selects the date on the rebooking prompt and defines the personal cadence baseline used for due/lapsed detection.';

-- Which providers perform which services, with optional overrides.
create table service_staff (
  service_id        uuid not null references services(id) on delete cascade,
  staff_id          uuid not null references staff(id) on delete cascade,
  price_override_cents integer check (price_override_cents >= 0),
  duration_override_min integer check (duration_override_min > 0),
  primary key (service_id, staff_id)
);

-- ---------------------------------------------------------------------------
-- Add-ons — the cheapest average-ticket lever there is
-- ---------------------------------------------------------------------------

create table addons (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  name              text not null,
  description       text,
  duration_min      integer not null default 0 check (duration_min >= 0),
  price_cents       integer not null default 0 check (price_cents >= 0),
  member_price_cents integer check (member_price_cents >= 0),
  cost_cents        integer not null default 0,
  taxable           boolean not null default true,
  image_url         text,
  sort_order        integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table service_addons (
  service_id        uuid not null references services(id) on delete cascade,
  addon_id          uuid not null references addons(id) on delete cascade,
  -- Recommended add-ons surface first in the booking flow.
  is_recommended    boolean not null default false,
  sort_order        integer not null default 0,
  primary key (service_id, addon_id)
);

-- ---------------------------------------------------------------------------
-- Retail
-- ---------------------------------------------------------------------------

create table products (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  name              text not null,
  sku               text,
  description       text,
  brand             text,
  image_url         text,
  price_cents       integer not null default 0 check (price_cents >= 0),
  member_price_cents integer check (member_price_cents >= 0),
  cost_cents        integer not null default 0,
  taxable           boolean not null default true,
  stock_quantity    integer,             -- null = untracked
  low_stock_threshold integer not null default 3,
  -- Typical days a unit lasts. Powers "you're due for a refill" nudges —
  -- retail replenishment is recurring revenue most businesses never chase.
  replenish_days    integer,
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on products (business_id) where active;

-- Products recommended after a given service (retail attach prompt).
create table service_products (
  service_id        uuid not null references services(id) on delete cascade,
  product_id        uuid not null references products(id) on delete cascade,
  sort_order        integer not null default 0,
  primary key (service_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Packages / series — prepaid blocks of visits. Cash up front, and a client
-- with sessions on the books is dramatically less likely to drift away.
-- ---------------------------------------------------------------------------

create table packages (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  name              text not null,
  description       text,
  -- Null service_id = credits usable against any service in `valid_service_ids`.
  service_id        uuid references services(id) on delete set null,
  valid_service_ids uuid[] not null default '{}',
  quantity          integer not null check (quantity > 0),
  price_cents       integer not null check (price_cents >= 0),
  -- What the same visits would cost à la carte, for "you save $X" framing.
  compare_at_cents  integer,
  expires_days      integer,             -- null = never expires
  transferable      boolean not null default false,
  stripe_price_id   text,
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

select attach_updated_at('service_categories');
select attach_updated_at('services');
select attach_updated_at('addons');
select attach_updated_at('products');
select attach_updated_at('packages');
