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

-- ---------------------------------------------------------------------------
-- Busy blocks — the double-booking guarantee
-- ---------------------------------------------------------------------------
-- A single [start, end) range per appointment cannot express a service with a
-- processing gap, where the provider is genuinely free in the middle. Modeling
-- provider-busy time as its own table lets the database enforce no-overlap
-- while still allowing a second client to be booked into that gap — which is
-- the largest capacity gain available to any business running color, laser, or
-- any other develop-and-wait service.
--
-- Rows here are maintained entirely by trigger. Never write to it directly.
--
-- Rooms are treated as occupied for the whole appointment, gap included: the
-- client is usually still sitting in it. Businesses where the client vacates
-- during processing can relax this by setting services.releases_room_in_gap.
-- ---------------------------------------------------------------------------

create table appointment_busy_blocks (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid not null references appointments(id) on delete cascade,
  business_id       uuid not null references businesses(id) on delete cascade,
  staff_id          uuid references staff(id) on delete cascade,
  room_id           uuid references rooms(id) on delete cascade,
  block             tstzrange not null,

  constraint busy_blocks_no_staff_overlap
    exclude using gist (staff_id with =, block with &&)
    where (staff_id is not null),

  constraint busy_blocks_no_room_overlap
    exclude using gist (room_id with =, block with &&)
    where (room_id is not null)
);

create index on appointment_busy_blocks (appointment_id);
create index on appointment_busy_blocks using gist (block);

-- Statuses that actually occupy the calendar.
create or replace function appointment_holds_time(p_status appointment_status)
returns boolean
language sql
immutable
as $$
  select p_status in ('requested', 'booked', 'confirmed', 'checked_in', 'in_progress');
$$;

create or replace function trg_sync_busy_blocks()
returns trigger
language plpgsql
as $$
declare
  v_releases_room boolean := false;
begin
  delete from appointment_busy_blocks where appointment_id = new.id;

  if not appointment_holds_time(new.status) then
    return new;
  end if;

  select coalesce(s.releases_room_in_gap, false) into v_releases_room
  from services s where s.id = new.service_id;

  -- Provider: one block, or two flanking the processing gap.
  if new.staff_id is not null then
    if new.gap_starts_at is not null and new.gap_ends_at is not null
       and new.gap_ends_at > new.gap_starts_at then
      insert into appointment_busy_blocks (appointment_id, business_id, staff_id, block)
      values
        (new.id, new.business_id, new.staff_id,
         tstzrange(new.blocks_at, new.gap_starts_at, '[)')),
        (new.id, new.business_id, new.staff_id,
         tstzrange(new.gap_ends_at, new.blocks_until, '[)'));
    else
      insert into appointment_busy_blocks (appointment_id, business_id, staff_id, block)
      values (new.id, new.business_id, new.staff_id,
              tstzrange(new.blocks_at, new.blocks_until, '[)'));
    end if;
  end if;

  -- Room: occupied throughout unless the service explicitly frees it.
  if new.room_id is not null then
    if v_releases_room and new.gap_starts_at is not null and new.gap_ends_at is not null then
      insert into appointment_busy_blocks (appointment_id, business_id, room_id, block)
      values
        (new.id, new.business_id, new.room_id,
         tstzrange(new.blocks_at, new.gap_starts_at, '[)')),
        (new.id, new.business_id, new.room_id,
         tstzrange(new.gap_ends_at, new.blocks_until, '[)'));
    else
      insert into appointment_busy_blocks (appointment_id, business_id, room_id, block)
      values (new.id, new.business_id, new.room_id,
              tstzrange(new.blocks_at, new.blocks_until, '[)'));
    end if;
  end if;

  return new;
end;
$$;

create trigger appointments_sync_busy_blocks
  after insert or update of status, staff_id, room_id, blocks_at, blocks_until,
                            gap_starts_at, gap_ends_at, service_id
  on appointments
  for each row execute function trg_sync_busy_blocks();

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
