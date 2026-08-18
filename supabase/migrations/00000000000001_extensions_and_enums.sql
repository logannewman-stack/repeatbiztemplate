-- ============================================================================
-- 0001 — EXTENSIONS, ENUMS, SHARED HELPERS
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- case-insensitive email
create extension if not exists "btree_gist";    -- exclusion constraints on ranges
create extension if not exists "pg_trgm";       -- fuzzy client search

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type staff_role as enum (
  'owner',        -- full access incl. billing + payouts
  'manager',      -- everything except billing
  'front_desk',   -- calendar, clients, checkout
  'provider',     -- own calendar + own clients
  'read_only'
);

create type appointment_status as enum (
  'requested',    -- awaiting business confirmation (request-to-book mode)
  'booked',       -- confirmed on the calendar
  'confirmed',    -- client actively confirmed via reminder
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled'   -- terminal; points at the replacement via rescheduled_to_id
);

create type booking_source as enum (
  'online', 'admin', 'phone', 'walk_in', 'rebook_prompt',
  'waitlist', 'campaign', 'membership_auto', 'import'
);

create type membership_status as enum (
  'trialing', 'active', 'past_due', 'paused', 'cancelling', 'cancelled', 'expired'
);

create type deposit_mode as enum ('none', 'flat', 'percent', 'full');

create type order_status as enum ('open', 'paid', 'partially_refunded', 'refunded', 'void');

create type order_item_kind as enum (
  'service', 'addon', 'product', 'package', 'membership',
  'gift_card', 'tip', 'fee', 'discount', 'tax'
);

create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'disputed');

create type message_channel as enum ('email', 'sms', 'push', 'in_app');

create type campaign_trigger as enum (
  'appointment_booked',
  'appointment_reminder',
  'appointment_completed',
  'rebooking_nudge',      -- past their ideal rebook date, no future booking
  'lapse_winback',        -- past lapse threshold
  'birthday',
  'membership_welcome',
  'membership_dunning',
  'membership_cancel_save',
  'membership_credit_expiring',
  'package_expiring',
  'review_request',
  'waitlist_offer',
  'no_show_followup',
  'first_visit_followup',
  'referral_invite',
  'manual'
);

create type send_status as enum (
  'scheduled', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'cancelled'
);

create type client_lifecycle as enum (
  'lead',       -- created, never completed a visit
  'new',        -- 1 completed visit
  'active',     -- visiting within their normal cadence
  'due',        -- past ideal rebook date, not yet lapsed
  'at_risk',    -- approaching lapse, or elevated no-show/cancel behavior
  'lapsed',     -- past lapse threshold
  'recovered',  -- returned after a lapse
  'vip'         -- top-decile spend or active member with high engagement
);

create type note_kind as enum ('note', 'formula', 'medical', 'preference', 'incident', 'consult');

create type waitlist_status as enum ('waiting', 'offered', 'claimed', 'expired', 'cancelled', 'fulfilled');

create type ledger_reason as enum (
  'period_grant', 'rollover', 'redemption', 'refund', 'manual_adjustment',
  'expiry', 'signup_bonus', 'save_offer'
);

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach `set_updated_at` to every table that has the column.
create or replace function attach_updated_at(tbl regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger trg_%s_updated_at before update on %s
       for each row execute function set_updated_at()',
    replace(tbl::text, '.', '_'), tbl
  );
end;
$$;
