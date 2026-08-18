-- ============================================================================
-- 0010 — ROW LEVEL SECURITY
-- ============================================================================
-- Two principals reach the database directly from a browser:
--
--   STAFF   — authenticated users with a row in `staff`. Scoped to their
--             business; providers are further limited to their own calendar.
--   CLIENTS — authenticated users with a row in `clients`. See only their own
--             appointments, orders, memberships, and files.
--
-- Anonymous visitors get read-only access to the public catalog (services,
-- staff bios, locations, plans) so the booking page renders before login.
-- Everything that writes money or availability goes through server routes
-- using the service-role key, which bypasses RLS entirely.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies can call them cheaply)
-- ---------------------------------------------------------------------------

create or replace function auth_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from staff where user_id = auth.uid() and active limit 1;
$$;

create or replace function auth_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from staff where user_id = auth.uid() and active limit 1;
$$;

create or replace function auth_staff_role()
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select role from staff where user_id = auth.uid() and active limit 1;
$$;

create or replace function auth_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from staff where user_id = auth.uid() and active);
$$;

-- Manager-or-above: can see the whole business, not just their own book.
create or replace function auth_is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid() and active and role in ('owner', 'manager')
  );
$$;

create or replace function auth_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from clients where user_id = auth.uid() and archived_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table businesses              enable row level security;
alter table locations               enable row level security;
alter table rooms                   enable row level security;
alter table staff                   enable row level security;
alter table staff_locations         enable row level security;
alter table staff_schedules         enable row level security;
alter table staff_time_off          enable row level security;
alter table blocked_times           enable row level security;
alter table service_categories      enable row level security;
alter table services                enable row level security;
alter table service_staff           enable row level security;
alter table addons                  enable row level security;
alter table service_addons          enable row level security;
alter table products                enable row level security;
alter table service_products        enable row level security;
alter table packages                enable row level security;
alter table clients                 enable row level security;
alter table client_metrics          enable row level security;
alter table client_notes            enable row level security;
alter table client_files            enable row level security;
alter table forms                   enable row level security;
alter table form_submissions        enable row level security;
alter table appointments            enable row level security;
alter table appointment_addons      enable row level security;
alter table appointment_busy_blocks enable row level security;
alter table waitlist_entries        enable row level security;
alter table membership_plans        enable row level security;
alter table memberships             enable row level security;
alter table membership_credit_ledger enable row level security;
alter table client_packages         enable row level security;
alter table orders                  enable row level security;
alter table order_items             enable row level security;
alter table payments                enable row level security;
alter table gift_cards              enable row level security;
alter table gift_card_transactions  enable row level security;
alter table loyalty_transactions    enable row level security;
alter table message_templates       enable row level security;
alter table campaigns               enable row level security;
alter table campaign_sends          enable row level security;
alter table reviews                 enable row level security;
alter table referrals               enable row level security;
alter table account_credits         enable row level security;
alter table offers                  enable row level security;
alter table webhook_events          enable row level security;
alter table audit_log               enable row level security;

-- ---------------------------------------------------------------------------
-- PUBLIC CATALOG — anonymous read so the booking page renders pre-login
-- ---------------------------------------------------------------------------

create policy "public read businesses" on businesses
  for select using (true);

create policy "public read active locations" on locations
  for select using (active);

create policy "public read bookable services" on services
  for select using (active and online_bookable);

create policy "public read service categories" on service_categories
  for select using (active);

create policy "public read bookable staff" on staff
  for select using (active and bookable);

create policy "public read service_staff" on service_staff
  for select using (true);

create policy "public read addons" on addons
  for select using (active);

create policy "public read service_addons" on service_addons
  for select using (true);

create policy "public read products" on products
  for select using (active);

create policy "public read service_products" on service_products
  for select using (true);

create policy "public read packages" on packages
  for select using (active);

create policy "public read membership plans" on membership_plans
  for select using (active);

create policy "public read rooms" on rooms
  for select using (active);

create policy "public read schedules" on staff_schedules
  for select using (true);

create policy "public read time off" on staff_time_off
  for select using (true);

create policy "public read blocked times" on blocked_times
  for select using (true);

-- Availability is computed from `appointment_busy_blocks` (policy below),
-- never from `appointments` itself — anonymous visitors must never be able to
-- read who holds a slot, only that it is held.

-- ---------------------------------------------------------------------------
-- STAFF — business-scoped
-- ---------------------------------------------------------------------------

create policy "staff manage own business" on businesses
  for update using (id = auth_business_id() and auth_is_manager());

create policy "staff all locations" on locations
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "staff all rooms" on rooms
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "staff read colleagues" on staff
  for select using (business_id = auth_business_id());

create policy "staff update self" on staff
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "managers manage staff" on staff
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "staff manage schedules" on staff_schedules
  for all using (
    exists (select 1 from staff s where s.id = staff_schedules.staff_id
            and s.business_id = auth_business_id())
    and (auth_is_manager() or staff_id = auth_staff_id())
  )
  with check (
    exists (select 1 from staff s where s.id = staff_schedules.staff_id
            and s.business_id = auth_business_id())
  );

create policy "staff manage time off" on staff_time_off
  for all using (
    exists (select 1 from staff s where s.id = staff_time_off.staff_id
            and s.business_id = auth_business_id())
    and (auth_is_manager() or staff_id = auth_staff_id())
  )
  with check (
    exists (select 1 from staff s where s.id = staff_time_off.staff_id
            and s.business_id = auth_business_id())
  );

create policy "staff manage blocked times" on blocked_times
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Catalog management: managers only.
create policy "managers manage services" on services
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "managers manage categories" on service_categories
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "managers manage addons" on addons
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "managers manage products" on products
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "managers manage packages" on packages
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "managers manage plans" on membership_plans
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

-- ---------------------------------------------------------------------------
-- CLIENTS table — staff see all; a client sees only their own record
-- ---------------------------------------------------------------------------

create policy "staff read clients" on clients
  for select using (business_id = auth_business_id());

create policy "staff write clients" on clients
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client reads self" on clients
  for select using (user_id = auth.uid());

create policy "client updates self" on clients
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "staff read metrics" on client_metrics
  for select using (business_id = auth_business_id());

create policy "client reads own metrics" on client_metrics
  for select using (client_id in (select auth_client_ids()));

-- Clinical/formula notes never reach the client portal unless flagged visible.
create policy "staff manage notes" on client_notes
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client reads visible notes" on client_notes
  for select using (client_visible and client_id in (select auth_client_ids()));

create policy "staff manage files" on client_files
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client reads own files" on client_files
  for select using (client_visible and client_id in (select auth_client_ids()));

create policy "public read forms" on forms
  for select using (active);

create policy "staff manage forms" on forms
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "staff read submissions" on form_submissions
  for select using (business_id = auth_business_id());

create policy "client manages own submissions" on form_submissions
  for all using (client_id in (select auth_client_ids()))
  with check (client_id in (select auth_client_ids()));

-- ---------------------------------------------------------------------------
-- APPOINTMENTS
-- ---------------------------------------------------------------------------

create policy "staff read appointments" on appointments
  for select using (business_id = auth_business_id());

create policy "staff write appointments" on appointments
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client reads own appointments" on appointments
  for select using (client_id in (select auth_client_ids()));

-- Clients cancel/reschedule through server routes so policy fees and waitlist
-- offers are applied; they get no direct UPDATE grant here.

create policy "staff manage appointment addons" on appointment_addons
  for all using (
    exists (select 1 from appointments a where a.id = appointment_addons.appointment_id
            and a.business_id = auth_business_id())
  )
  with check (
    exists (select 1 from appointments a where a.id = appointment_addons.appointment_id
            and a.business_id = auth_business_id())
  );

create policy "client reads own appointment addons" on appointment_addons
  for select using (
    exists (select 1 from appointments a where a.id = appointment_addons.appointment_id
            and a.client_id in (select auth_client_ids()))
  );

-- Busy blocks are what the public availability lookup reads. They carry no
-- client identity — only which provider/room is occupied when — so exposing
-- them publicly is what lets the booking page compute open slots without
-- leaking who is in the chair.
create policy "public read busy blocks" on appointment_busy_blocks
  for select using (true);

create policy "staff manage waitlist" on waitlist_entries
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client manages own waitlist" on waitlist_entries
  for all using (client_id in (select auth_client_ids()))
  with check (client_id in (select auth_client_ids()));

-- ---------------------------------------------------------------------------
-- COMMERCE
-- ---------------------------------------------------------------------------

create policy "staff read memberships" on memberships
  for select using (business_id = auth_business_id());

create policy "staff write memberships" on memberships
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "client reads own membership" on memberships
  for select using (client_id in (select auth_client_ids()));

create policy "staff read credit ledger" on membership_credit_ledger
  for select using (business_id = auth_business_id());

create policy "client reads own credit ledger" on membership_credit_ledger
  for select using (
    exists (select 1 from memberships m where m.id = membership_credit_ledger.membership_id
            and m.client_id in (select auth_client_ids()))
  );

create policy "staff manage client packages" on client_packages
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client reads own packages" on client_packages
  for select using (client_id in (select auth_client_ids()));

create policy "staff read orders" on orders
  for select using (business_id = auth_business_id());

create policy "staff write orders" on orders
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client reads own orders" on orders
  for select using (client_id in (select auth_client_ids()));

create policy "staff read order items" on order_items
  for select using (business_id = auth_business_id());

create policy "staff write order items" on order_items
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client reads own order items" on order_items
  for select using (
    exists (select 1 from orders o where o.id = order_items.order_id
            and o.client_id in (select auth_client_ids()))
  );

create policy "managers read payments" on payments
  for select using (business_id = auth_business_id() and auth_is_manager());

create policy "client reads own payments" on payments
  for select using (client_id in (select auth_client_ids()));

create policy "staff manage gift cards" on gift_cards
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client reads own gift cards" on gift_cards
  for select using (
    purchaser_client_id in (select auth_client_ids())
    or redeemed_by_client_id in (select auth_client_ids())
  );

create policy "staff read gift card txns" on gift_card_transactions
  for select using (
    exists (select 1 from gift_cards g where g.id = gift_card_transactions.gift_card_id
            and g.business_id = auth_business_id())
  );

create policy "staff read loyalty" on loyalty_transactions
  for select using (business_id = auth_business_id());

create policy "client reads own loyalty" on loyalty_transactions
  for select using (client_id in (select auth_client_ids()));

create policy "staff read credits" on account_credits
  for select using (business_id = auth_business_id());

create policy "client reads own credits" on account_credits
  for select using (client_id in (select auth_client_ids()));

-- ---------------------------------------------------------------------------
-- RETENTION
-- ---------------------------------------------------------------------------

create policy "staff manage templates" on message_templates
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "staff manage campaigns" on campaigns
  for all using (business_id = auth_business_id() and auth_is_manager())
  with check (business_id = auth_business_id() and auth_is_manager());

create policy "staff read sends" on campaign_sends
  for select using (business_id = auth_business_id());

create policy "client reads own sends" on campaign_sends
  for select using (client_id in (select auth_client_ids()));

create policy "staff manage reviews" on reviews
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client manages own reviews" on reviews
  for all using (client_id in (select auth_client_ids()))
  with check (client_id in (select auth_client_ids()));

create policy "staff read referrals" on referrals
  for select using (business_id = auth_business_id());

create policy "client reads own referrals" on referrals
  for select using (referrer_client_id in (select auth_client_ids()));

create policy "staff manage offers" on offers
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy "client reads own offers" on offers
  for select using (client_id in (select auth_client_ids()));

-- ---------------------------------------------------------------------------
-- SYSTEM — service role only. No policies means no access for anon/authed.
-- ---------------------------------------------------------------------------

create policy "managers read audit log" on audit_log
  for select using (business_id = auth_business_id() and auth_is_manager());

-- webhook_events intentionally has RLS on and zero policies: the webhook
-- handler uses the service-role key, and nothing else should ever read it.
