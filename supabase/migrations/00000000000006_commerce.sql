-- ============================================================================
-- 0006 — COMMERCE: memberships (MRR), orders, payments, packages, gift cards
-- ============================================================================
-- Memberships are the MRR engine. A membership converts a variable, seasonal,
-- attention-dependent revenue stream into a predictable one and — because the
-- client has already paid — makes them materially more likely to show up.
-- ============================================================================

create table membership_plans (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  name              text not null,
  slug              text not null,
  description       text,
  pitch             text,                -- one-line sales copy

  price_cents       integer not null check (price_cents >= 0),
  billing_interval  text not null default 'month' check (billing_interval in ('month', 'year')),
  interval_count    integer not null default 1 check (interval_count > 0),
  setup_fee_cents   integer not null default 0,
  trial_days        integer not null default 0,

  -- Benefits -------------------------------------------------------------
  -- Credits granted each billing period. One credit = one included visit.
  included_credits  integer not null default 0 check (included_credits >= 0),
  -- Which services a credit can be redeemed against. Empty = any service.
  credit_service_ids uuid[] not null default '{}',
  -- Percent off everything not covered by a credit.
  discount_pct      integer not null default 0 check (discount_pct between 0 and 100),
  retail_discount_pct integer not null default 0 check (retail_discount_pct between 0 and 100),
  -- Free-text perks rendered as a checklist on the sales page.
  perks             jsonb not null default '[]'::jsonb,
  -- Members skip deposits and get earlier access to the booking calendar.
  waives_deposits   boolean not null default true,
  priority_booking_days integer not null default 0,

  -- Retention terms ------------------------------------------------------
  commitment_months integer not null default 0,
  rollover_periods  integer not null default 3,
  max_banked_credits integer not null default 6,
  allow_pause       boolean not null default true,

  stripe_product_id text,
  stripe_price_id   text,

  -- Cap total members (scarcity sells, and protects provider capacity).
  max_members       integer,
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, slug)
);

create table memberships (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  plan_id           uuid not null references membership_plans(id) on delete restrict,

  status            membership_status not null default 'active',
  stripe_subscription_id text unique,
  stripe_customer_id text,

  current_period_start timestamptz,
  current_period_end   timestamptz,
  -- Banked credits available right now.
  credits_balance   integer not null default 0,
  -- Credits used this period, for the "2 of 3 used" progress bar.
  credits_used_this_period integer not null default 0,

  started_at        timestamptz not null default now(),
  -- Earliest date the member is allowed to cancel (commitment term).
  commitment_ends_at timestamptz,

  -- Pause ----------------------------------------------------------------
  paused_at         timestamptz,
  paused_until      timestamptz,
  pauses_used_this_year integer not null default 0,

  -- Cancellation ---------------------------------------------------------
  cancel_at_period_end boolean not null default false,
  cancellation_requested_at timestamptz,
  cancellation_reason text,
  cancelled_at      timestamptz,
  -- Which save offer, if any, retained them. Tells you which offer to keep.
  save_offer_accepted text,
  save_offers_shown text[] not null default '{}',

  -- Dunning --------------------------------------------------------------
  past_due_since    timestamptz,
  dunning_attempts  integer not null default 0,
  last_payment_failed_at timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on memberships (business_id, status);
create index on memberships (client_id, status);
create index on memberships (stripe_subscription_id);
-- One active membership per client per plan.
create unique index memberships_one_active_per_client
  on memberships (client_id)
  where status in ('trialing', 'active', 'past_due', 'paused', 'cancelling');

comment on table memberships is
  'The MRR engine. Sum of plan price over rows in trialing/active/past_due = MRR. Paused subscriptions are intentionally excluded from MRR but retained as recoverable.';

-- Every credit movement, so balances are auditable and expiry is enforceable.
create table membership_credit_ledger (
  id                uuid primary key default gen_random_uuid(),
  membership_id     uuid not null references memberships(id) on delete cascade,
  business_id       uuid not null references businesses(id) on delete cascade,
  delta             integer not null,     -- +grant, -redemption
  balance_after     integer not null,
  reason            ledger_reason not null,
  appointment_id    uuid references appointments(id) on delete set null,
  expires_at        timestamptz,
  note              text,
  created_at        timestamptz not null default now()
);

create index on membership_credit_ledger (membership_id, created_at desc);
create index on membership_credit_ledger (expires_at) where expires_at is not null;

alter table appointments
  add constraint appointments_membership_fk
  foreign key (membership_id) references memberships(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Purchased packages
-- ---------------------------------------------------------------------------

create table client_packages (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  package_id        uuid not null references packages(id) on delete restrict,
  name_snapshot     text not null,
  total_quantity    integer not null,
  remaining_quantity integer not null check (remaining_quantity >= 0),
  price_paid_cents  integer not null default 0,
  purchased_at      timestamptz not null default now(),
  expires_at        timestamptz,
  -- Warned about expiry already? Prevents duplicate nudges.
  expiry_warned_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on client_packages (client_id) where remaining_quantity > 0;
create index on client_packages (business_id, expires_at)
  where remaining_quantity > 0 and expires_at is not null;

alter table appointments
  add constraint appointments_client_package_fk
  foreign key (client_package_id) references client_packages(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Orders & payments
-- ---------------------------------------------------------------------------

create table orders (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  client_id         uuid references clients(id) on delete set null,
  appointment_id    uuid references appointments(id) on delete set null,
  location_id       uuid references locations(id) on delete set null,
  staff_id          uuid references staff(id) on delete set null,

  number            bigserial,
  status            order_status not null default 'open',

  subtotal_cents    integer not null default 0,
  discount_cents    integer not null default 0,
  tax_cents         integer not null default 0,
  tip_cents         integer not null default 0,
  total_cents       integer not null default 0,
  refunded_cents    integer not null default 0,

  -- Non-cash settlement, tracked so revenue reports don't double count.
  membership_credit_applied integer not null default 0,
  package_credit_applied    integer not null default 0,
  gift_card_cents_applied   integer not null default 0,
  loyalty_points_applied    integer not null default 0,

  currency          char(3) not null default 'USD',
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,

  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on orders (business_id, created_at desc);
create index on orders (client_id, created_at desc);
create index on orders (appointment_id);

alter table appointments
  add constraint appointments_order_fk
  foreign key (order_id) references orders(id) on delete set null;

create table order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  business_id       uuid not null references businesses(id) on delete cascade,
  kind              order_item_kind not null,
  -- Points at services.id / addons.id / products.id / packages.id / etc.
  reference_id      uuid,
  name_snapshot     text not null,
  quantity          integer not null default 1 check (quantity > 0),
  unit_price_cents  integer not null default 0,
  total_cents       integer not null default 0,
  cost_cents        integer not null default 0,
  -- Attribution: did this line come from an upsell prompt?
  from_upsell       boolean not null default false,
  staff_id          uuid references staff(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index on order_items (order_id);
create index on order_items (business_id, kind, created_at desc);

create table payments (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  order_id          uuid references orders(id) on delete set null,
  client_id         uuid references clients(id) on delete set null,
  appointment_id    uuid references appointments(id) on delete set null,
  membership_id     uuid references memberships(id) on delete set null,

  amount_cents      integer not null,
  currency          char(3) not null default 'USD',
  status            payment_status not null default 'pending',
  -- 'card' | 'cash' | 'gift_card' | 'membership_credit' | 'package' | 'other'
  method            text not null default 'card',
  -- 'sale' | 'deposit' | 'cancellation_fee' | 'no_show_fee' | 'subscription'
  purpose           text not null default 'sale',

  stripe_payment_intent_id text,
  stripe_charge_id  text,
  stripe_invoice_id text,
  failure_code      text,
  failure_message   text,

  refunded_cents    integer not null default 0,
  processed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on payments (business_id, created_at desc);
create index on payments (order_id);
create index on payments (stripe_payment_intent_id);

-- ---------------------------------------------------------------------------
-- Gift cards
-- ---------------------------------------------------------------------------

create table gift_cards (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  code              text not null unique,
  initial_cents     integer not null check (initial_cents > 0),
  balance_cents     integer not null check (balance_cents >= 0),
  purchaser_client_id uuid references clients(id) on delete set null,
  recipient_name    text,
  recipient_email   citext,
  message           text,
  -- Scheduled delivery for holiday sales.
  deliver_at        timestamptz,
  delivered_at      timestamptz,
  expires_at        timestamptz,
  redeemed_by_client_id uuid references clients(id) on delete set null,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table gift_card_transactions (
  id                uuid primary key default gen_random_uuid(),
  gift_card_id      uuid not null references gift_cards(id) on delete cascade,
  order_id          uuid references orders(id) on delete set null,
  delta_cents       integer not null,
  balance_after     integer not null,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Loyalty
-- ---------------------------------------------------------------------------

create table loyalty_transactions (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  points            integer not null,     -- +earn, -redeem
  balance_after     integer not null,
  -- 'visit' | 'rebook' | 'review' | 'referral' | 'membership' | 'redemption'
  --   | 'streak' | 'expiry' | 'manual'
  reason            text not null,
  order_id          uuid references orders(id) on delete set null,
  appointment_id    uuid references appointments(id) on delete set null,
  expires_at        timestamptz,
  note              text,
  created_at        timestamptz not null default now()
);

create index on loyalty_transactions (client_id, created_at desc);

select attach_updated_at('membership_plans');
select attach_updated_at('memberships');
select attach_updated_at('client_packages');
select attach_updated_at('orders');
select attach_updated_at('payments');
select attach_updated_at('gift_cards');
