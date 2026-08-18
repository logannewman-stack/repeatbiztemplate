-- ============================================================================
-- 0005 — BOOKING: appointments, add-ons, waitlist
-- ============================================================================

create table appointments (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  location_id       uuid not null references locations(id) on delete restrict,
  client_id         uuid not null references clients(id) on delete restrict,
  staff_id          uuid references staff(id) on delete set null,
  service_id        uuid not null references services(id) on delete restrict,
  room_id           uuid references rooms(id) on delete set null,

  -- Timing ---------------------------------------------------------------
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- The provider-busy window including buffers. What the engine actually
  -- checks for conflicts; `starts_at`/`ends_at` are what the client sees.
  blocks_at         timestamptz not null,
  blocks_until      timestamptz not null,
  -- Processing gap, when the provider is free mid-service.
  gap_starts_at     timestamptz,
  gap_ends_at       timestamptz,
  duration_min      integer not null,

  status            appointment_status not null default 'booked',
  source            booking_source not null default 'online',

  -- Money ----------------------------------------------------------------
  price_cents       integer not null default 0,
  addons_cents      integer not null default 0,
  discount_cents    integer not null default 0,
  deposit_cents     integer not null default 0,
  deposit_paid_at   timestamptz,
  deposit_payment_intent_id text,
  -- Set when the visit is paid out at checkout.
  order_id          uuid,
  -- Redeemed a membership credit or a package session instead of paying.
  membership_id     uuid,
  client_package_id uuid,
  paid_with_credit  boolean not null default false,

  -- Retention ------------------------------------------------------------
  -- Which appointment this was booked from. A non-null value means the
  -- rebooking prompt worked — this is how rebook rate is measured.
  rebooked_from_id  uuid references appointments(id) on delete set null,
  -- Terminal reschedules point at their replacement.
  rescheduled_to_id uuid references appointments(id) on delete set null,
  reschedule_count  integer not null default 0,
  -- Which campaign send, if any, produced this booking. Attribution.
  attributed_send_id uuid,

  -- Lifecycle ------------------------------------------------------------
  confirmed_at      timestamptz,
  checked_in_at     timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  cancelled_by      text,                -- 'client' | 'staff' | 'system'
  cancellation_reason text,
  cancellation_fee_cents integer not null default 0,
  no_show_at        timestamptz,
  no_show_fee_cents integer not null default 0,

  client_notes      text,                -- what the client typed when booking
  internal_notes    text,
  created_by        uuid references staff(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  check (ends_at > starts_at),
  check (blocks_until > blocks_at)
);

create index on appointments (business_id, starts_at);
create index on appointments (staff_id, blocks_at, blocks_until);
create index on appointments (client_id, starts_at desc);
create index on appointments (location_id, starts_at);
create index on appointments (room_id, starts_at) where room_id is not null;
create index on appointments (business_id, status, starts_at);
create index appointments_future_active on appointments (client_id, starts_at)
  where status in ('requested', 'booked', 'confirmed');

comment on column appointments.rebooked_from_id is
  'Non-null when this booking came from the rebooking prompt on a prior visit. Rebook rate = count(rebooked_from_id) / count(completed appointments).';

-- Late-bound FKs from 0004.
alter table client_notes
  add constraint client_notes_appointment_fk
  foreign key (appointment_id) references appointments(id) on delete set null;
alter table client_files
  add constraint client_files_appointment_fk
  foreign key (appointment_id) references appointments(id) on delete set null;
alter table form_submissions
  add constraint form_submissions_appointment_fk
  foreign key (appointment_id) references appointments(id) on delete set null;

-- Hard guarantee against double-booking a provider. Cancelled, no-show, and
-- rescheduled rows are excluded so a freed slot is immediately reusable.
-- The processing-gap overlap optimization is handled in the availability
-- engine, which books the second client entirely inside the first's gap; that
-- still produces non-overlapping [blocks_at, blocks_until) ranges.
alter table appointments
  add constraint appointments_no_provider_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(blocks_at, blocks_until) with &&
  ) where (
    staff_id is not null
    and status in ('requested', 'booked', 'confirmed', 'checked_in', 'in_progress')
  );

-- Same guarantee for rooms with capacity 1.
alter table appointments
  add constraint appointments_no_room_overlap
  exclude using gist (
    room_id with =,
    tstzrange(blocks_at, blocks_until) with &&
  ) where (
    room_id is not null
    and status in ('requested', 'booked', 'confirmed', 'checked_in', 'in_progress')
  );

create table appointment_addons (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid not null references appointments(id) on delete cascade,
  addon_id          uuid not null references addons(id) on delete restrict,
  name_snapshot     text not null,
  price_cents       integer not null default 0,
  duration_min      integer not null default 0,
  -- Whether this add-on came from the upsell prompt rather than the client
  -- selecting it themselves. Measures whether the upsell engine earns its keep.
  from_upsell       boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (appointment_id, addon_id)
);

-- ---------------------------------------------------------------------------
-- Waitlist — turns cancellations into revenue instead of empty chairs
-- ---------------------------------------------------------------------------

create table waitlist_entries (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  service_id        uuid not null references services(id) on delete cascade,
  location_id       uuid references locations(id) on delete cascade,
  -- Null = any available provider.
  staff_id          uuid references staff(id) on delete set null,

  -- The window the client would accept.
  window_start      timestamptz not null,
  window_end        timestamptz not null,
  -- Preferred days-of-week and time-of-day inside that window.
  preferred_weekdays smallint[] not null default '{}',
  earliest_time     time,
  latest_time       time,

  status            waitlist_status not null default 'waiting',
  priority          integer not null default 0,   -- members and VIPs jump the queue
  -- Set while an offer is outstanding.
  offered_appointment_slot jsonb,
  offered_at        timestamptz,
  offer_expires_at  timestamptz,
  claimed_at        timestamptz,
  fulfilled_appointment_id uuid references appointments(id) on delete set null,
  notify_channel    message_channel not null default 'sms',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (window_end > window_start)
);

create index on waitlist_entries (business_id, status, window_start);
create index on waitlist_entries (service_id, status);
create index on waitlist_entries (client_id);

select attach_updated_at('appointments');
select attach_updated_at('waitlist_entries');
