-- ============================================================================
-- 0008 — FUNCTIONS: metric rollups, risk scoring, retention queries
-- ============================================================================

-- ---------------------------------------------------------------------------
-- no_show_risk — 0-100, drives deposit enforcement
-- ---------------------------------------------------------------------------
-- Deliberately simple and explainable. An owner needs to be able to look a
-- client in the eye and say why a deposit is being asked for. A black-box
-- model that can't be explained at the front desk doesn't get used.
-- ---------------------------------------------------------------------------

create or replace function compute_no_show_risk(
  p_no_shows integer,
  p_late_cancels integer,
  p_completed integer,
  p_days_since_last_visit numeric
) returns integer
language plpgsql
immutable
as $$
declare
  v_total integer := greatest(p_completed + p_no_shows + p_late_cancels, 1);
  v_score numeric := 0;
begin
  -- Base rate: share of past bookings the client didn't honor.
  v_score := 100.0 * (p_no_shows * 1.0 + p_late_cancels * 0.5) / v_total;

  -- A brand-new client with no history is a moderate unknown, not a saint.
  if p_completed = 0 and p_no_shows = 0 and p_late_cancels = 0 then
    return 35;
  end if;

  -- Recent no-shows matter more than ancient ones; a long gap since the last
  -- visit means the relationship has cooled and attendance gets less reliable.
  if p_days_since_last_visit is not null and p_days_since_last_visit > 180 then
    v_score := v_score + 10;
  end if;

  -- Trust earned by volume: 10+ clean visits meaningfully de-risks a client.
  if p_completed >= 10 and p_no_shows = 0 then
    v_score := v_score * 0.5;
  elsif p_completed >= 5 and p_no_shows = 0 then
    v_score := v_score * 0.7;
  end if;

  -- Any no-show at all sets a floor — one is a fluke, but not a zero.
  if p_no_shows > 0 then
    v_score := greatest(v_score, 30);
  end if;
  if p_no_shows >= 2 then
    v_score := greatest(v_score, 60);
  end if;

  return least(100, greatest(0, round(v_score)::integer));
end;
$$;

-- ---------------------------------------------------------------------------
-- churn_risk — 0-100, drives winback priority and the at-risk queue
-- ---------------------------------------------------------------------------

create or replace function compute_churn_risk(
  p_days_since_last_visit numeric,
  p_expected_interval numeric,
  p_has_future_booking boolean,
  p_completed integer,
  p_is_member boolean
) returns integer
language plpgsql
immutable
as $$
declare
  v_ratio numeric;
  v_score numeric := 0;
begin
  -- Never visited: they're a lead, not a churn risk.
  if p_days_since_last_visit is null then
    return 0;
  end if;

  -- A booked next visit is the strongest retention signal that exists.
  if p_has_future_booking then
    return 5;
  end if;

  -- How far past their own normal cadence are they?
  v_ratio := p_days_since_last_visit / greatest(p_expected_interval, 1);

  v_score := case
    when v_ratio < 0.8 then 10        -- not due yet
    when v_ratio < 1.0 then 25        -- coming due
    when v_ratio < 1.5 then 50        -- overdue, still very recoverable
    when v_ratio < 2.0 then 70        -- at risk
    when v_ratio < 3.0 then 85        -- lapsed
    else 95                            -- effectively gone
  end;

  -- One-visit clients churn far more than established regulars.
  if p_completed <= 1 then
    v_score := v_score + 10;
  elsif p_completed >= 10 then
    v_score := v_score - 15;
  elsif p_completed >= 5 then
    v_score := v_score - 8;
  end if;

  -- An active membership is a contract and a sunk cost; both hold people.
  if p_is_member then
    v_score := v_score - 25;
  end if;

  return least(100, greatest(0, round(v_score)::integer));
end;
$$;

-- ---------------------------------------------------------------------------
-- refresh_client_metrics — recompute the rollup for one client
-- ---------------------------------------------------------------------------

create or replace function refresh_client_metrics(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_visit_count integer;
  v_completed integer;
  v_cancelled integer;
  v_late_cancel integer;
  v_no_show integer;
  v_reschedules integer;
  v_first_visit timestamptz;
  v_last_visit timestamptz;
  v_avg_gap numeric;
  v_ltv bigint;
  v_service_rev bigint;
  v_retail_rev bigint;
  v_membership_rev bigint;
  v_tips bigint;
  v_avg_ticket integer;
  v_spend_90 integer;
  v_spend_365 integer;
  v_has_future boolean;
  v_next_appt timestamptz;
  v_expected_interval numeric;
  v_next_expected timestamptz;
  v_lapse_at timestamptz;
  v_days_since numeric;
  v_is_member boolean;
  v_no_show_risk integer;
  v_churn_risk integer;
  v_rebook_rate numeric;
  v_points integer;
  v_tier text;
  v_lifecycle client_lifecycle;
  v_lapse_multiplier numeric;
begin
  select business_id into v_business_id from clients where id = p_client_id;
  if v_business_id is null then
    return;
  end if;

  -- Appointment counts ---------------------------------------------------
  select
    count(*) filter (where status in ('completed', 'checked_in', 'in_progress')),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status = 'cancelled' and cancellation_fee_cents > 0),
    count(*) filter (where status = 'no_show'),
    coalesce(sum(reschedule_count), 0),
    min(completed_at) filter (where status = 'completed'),
    max(completed_at) filter (where status = 'completed')
  into v_visit_count, v_completed, v_cancelled, v_late_cancel, v_no_show,
       v_reschedules, v_first_visit, v_last_visit
  from appointments
  where client_id = p_client_id;

  -- Personal cadence: average gap between consecutive completed visits.
  select avg(gap) into v_avg_gap
  from (
    select extract(epoch from (completed_at - lag(completed_at)
             over (order by completed_at))) / 86400.0 as gap
    from appointments
    where client_id = p_client_id and status = 'completed'
    order by completed_at
  ) g
  where gap is not null and gap > 0;

  -- Money ----------------------------------------------------------------
  select
    coalesce(sum(o.total_cents), 0),
    coalesce(sum(o.tip_cents), 0),
    coalesce(sum(o.total_cents) filter (where o.created_at > now() - interval '90 days'), 0),
    coalesce(sum(o.total_cents) filter (where o.created_at > now() - interval '365 days'), 0)
  into v_ltv, v_tips, v_spend_90, v_spend_365
  from orders o
  where o.client_id = p_client_id and o.status in ('paid', 'partially_refunded');

  select
    coalesce(sum(oi.total_cents) filter (where oi.kind in ('service', 'addon')), 0),
    coalesce(sum(oi.total_cents) filter (where oi.kind = 'product'), 0),
    coalesce(sum(oi.total_cents) filter (where oi.kind = 'membership'), 0)
  into v_service_rev, v_retail_rev, v_membership_rev
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.client_id = p_client_id and o.status in ('paid', 'partially_refunded');

  v_avg_ticket := case when v_completed > 0
    then (v_ltv / v_completed)::integer else 0 end;

  -- Future booking — the headline retention signal ------------------------
  select
    count(*) > 0,
    min(starts_at)
  into v_has_future, v_next_appt
  from appointments
  where client_id = p_client_id
    and status in ('requested', 'booked', 'confirmed')
    and starts_at > now();

  -- Expected cadence ------------------------------------------------------
  -- Prefer the client's own observed average; fall back to the interval on
  -- the service they most recently had.
  if v_avg_gap is not null and v_completed >= 2 then
    v_expected_interval := v_avg_gap;
  else
    select coalesce(s.rebook_interval_days, 30) into v_expected_interval
    from appointments a
    join services s on s.id = a.service_id
    where a.client_id = p_client_id and a.status = 'completed'
    order by a.completed_at desc
    limit 1;
    v_expected_interval := coalesce(v_expected_interval, 30);
  end if;

  select coalesce((policy #>> '{lapse,lapseMultiplier}')::numeric, 2.0)
  into v_lapse_multiplier
  from businesses where id = v_business_id;

  if v_last_visit is not null then
    v_next_expected := v_last_visit + (v_expected_interval || ' days')::interval;
    v_lapse_at := v_last_visit + (v_expected_interval * v_lapse_multiplier || ' days')::interval;
    v_days_since := extract(epoch from (now() - v_last_visit)) / 86400.0;
  end if;

  select exists (
    select 1 from memberships
    where client_id = p_client_id and status in ('active', 'trialing', 'past_due')
  ) into v_is_member;

  -- Scores ---------------------------------------------------------------
  v_no_show_risk := compute_no_show_risk(v_no_show, v_late_cancel, v_completed, v_days_since);
  v_churn_risk := compute_churn_risk(
    v_days_since, v_expected_interval, coalesce(v_has_future, false),
    v_completed, coalesce(v_is_member, false)
  );

  -- Rebook rate: share of completed visits that produced a next booking.
  select case when v_completed > 0
    then round(100.0 * count(*) / v_completed, 2) else 0 end
  into v_rebook_rate
  from appointments
  where client_id = p_client_id and rebooked_from_id is not null;

  select coalesce(sum(points), 0) into v_points
  from loyalty_transactions where client_id = p_client_id;

  v_tier := case
    when v_spend_365 >= 250000 then 'Platinum'
    when v_spend_365 >= 120000 then 'Gold'
    when v_spend_365 >= 50000  then 'Silver'
    else 'Member'
  end;

  -- Lifecycle ------------------------------------------------------------
  v_lifecycle := case
    when v_completed = 0 then 'lead'::client_lifecycle
    when v_is_member and v_spend_365 >= 120000 then 'vip'::client_lifecycle
    when v_spend_365 >= 250000 then 'vip'::client_lifecycle
    when v_has_future then 'active'::client_lifecycle
    when v_days_since is null then 'new'::client_lifecycle
    when v_days_since > v_expected_interval * v_lapse_multiplier then 'lapsed'::client_lifecycle
    when v_days_since > v_expected_interval * 1.5 then 'at_risk'::client_lifecycle
    when v_days_since > v_expected_interval then 'due'::client_lifecycle
    when v_completed = 1 then 'new'::client_lifecycle
    else 'active'::client_lifecycle
  end;

  insert into client_metrics (
    client_id, business_id, visit_count, completed_count, cancelled_count,
    late_cancel_count, no_show_count, reschedule_count,
    lifetime_value_cents, service_revenue_cents, retail_revenue_cents,
    membership_revenue_cents, tip_cents, avg_ticket_cents,
    spend_90d_cents, spend_365d_cents,
    first_visit_at, last_visit_at, avg_days_between_visits,
    next_expected_at, lapse_at, has_future_booking, next_appointment_at,
    no_show_risk, churn_risk, rebook_rate,
    loyalty_points, loyalty_tier, lifecycle, computed_at
  ) values (
    p_client_id, v_business_id, v_visit_count, v_completed, v_cancelled,
    v_late_cancel, v_no_show, v_reschedules,
    v_ltv, v_service_rev, v_retail_rev, v_membership_rev, v_tips, v_avg_ticket,
    v_spend_90, v_spend_365,
    v_first_visit, v_last_visit, v_avg_gap,
    v_next_expected, v_lapse_at, coalesce(v_has_future, false), v_next_appt,
    v_no_show_risk, v_churn_risk, coalesce(v_rebook_rate, 0),
    v_points, v_tier, v_lifecycle, now()
  )
  on conflict (client_id) do update set
    visit_count = excluded.visit_count,
    completed_count = excluded.completed_count,
    cancelled_count = excluded.cancelled_count,
    late_cancel_count = excluded.late_cancel_count,
    no_show_count = excluded.no_show_count,
    reschedule_count = excluded.reschedule_count,
    lifetime_value_cents = excluded.lifetime_value_cents,
    service_revenue_cents = excluded.service_revenue_cents,
    retail_revenue_cents = excluded.retail_revenue_cents,
    membership_revenue_cents = excluded.membership_revenue_cents,
    tip_cents = excluded.tip_cents,
    avg_ticket_cents = excluded.avg_ticket_cents,
    spend_90d_cents = excluded.spend_90d_cents,
    spend_365d_cents = excluded.spend_365d_cents,
    first_visit_at = excluded.first_visit_at,
    last_visit_at = excluded.last_visit_at,
    avg_days_between_visits = excluded.avg_days_between_visits,
    next_expected_at = excluded.next_expected_at,
    lapse_at = excluded.lapse_at,
    has_future_booking = excluded.has_future_booking,
    next_appointment_at = excluded.next_appointment_at,
    no_show_risk = excluded.no_show_risk,
    churn_risk = excluded.churn_risk,
    rebook_rate = excluded.rebook_rate,
    loyalty_points = excluded.loyalty_points,
    loyalty_tier = excluded.loyalty_tier,
    lifecycle = excluded.lifecycle,
    computed_at = now();
end;
$$;

-- Keep metrics fresh as appointments and orders move.
create or replace function trg_refresh_client_metrics()
returns trigger
language plpgsql
as $$
begin
  perform refresh_client_metrics(coalesce(new.client_id, old.client_id));
  return coalesce(new, old);
end;
$$;

create trigger appointments_refresh_metrics
  after insert or update of status, completed_at, starts_at or delete
  on appointments
  for each row execute function trg_refresh_client_metrics();

create trigger orders_refresh_metrics
  after insert or update of status, total_cents or delete
  on orders
  for each row execute function trg_refresh_client_metrics();

-- Create the metrics row as soon as a client exists.
create or replace function trg_init_client_metrics()
returns trigger
language plpgsql
as $$
begin
  insert into client_metrics (client_id, business_id)
  values (new.id, new.business_id)
  on conflict (client_id) do nothing;
  return new;
end;
$$;

create trigger clients_init_metrics
  after insert on clients
  for each row execute function trg_init_client_metrics();

-- ---------------------------------------------------------------------------
-- Referral codes
-- ---------------------------------------------------------------------------

create or replace function generate_referral_code()
returns text
language plpgsql
as $$
declare
  v_code text;
begin
  loop
    -- Ambiguous characters removed so codes survive being read aloud.
    v_code := upper(
      translate(
        substr(encode(gen_random_bytes(6), 'base64'), 1, 7),
        '+/=OI01l', 'XYZWMNPQ'
      )
    );
    exit when not exists (select 1 from clients where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function trg_assign_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := generate_referral_code();
  end if;
  return new;
end;
$$;

create trigger clients_assign_referral_code
  before insert on clients
  for each row execute function trg_assign_referral_code();

-- ---------------------------------------------------------------------------
-- Membership credit helpers
-- ---------------------------------------------------------------------------

create or replace function grant_membership_credits(
  p_membership_id uuid,
  p_amount integer,
  p_reason ledger_reason default 'period_grant'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_max integer;
  v_business_id uuid;
  v_rollover integer;
begin
  select m.credits_balance, m.business_id, p.max_banked_credits, p.rollover_periods
  into v_balance, v_business_id, v_max, v_rollover
  from memberships m
  join membership_plans p on p.id = m.plan_id
  where m.id = p_membership_id
  for update;

  if not found then
    raise exception 'membership % not found', p_membership_id;
  end if;

  -- Cap banked credits so the business's liability stays bounded.
  v_balance := least(v_balance + p_amount, coalesce(v_max, 999));

  update memberships
  set credits_balance = v_balance,
      credits_used_this_period = case
        when p_reason = 'period_grant' then 0
        else credits_used_this_period
      end
  where id = p_membership_id;

  insert into membership_credit_ledger (
    membership_id, business_id, delta, balance_after, reason, expires_at
  ) values (
    p_membership_id, v_business_id, p_amount, v_balance, p_reason,
    case when coalesce(v_rollover, 0) > 0
      then now() + (v_rollover || ' months')::interval
      else now() + interval '1 month'
    end
  );

  return v_balance;
end;
$$;

create or replace function redeem_membership_credit(
  p_membership_id uuid,
  p_appointment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_business_id uuid;
begin
  select credits_balance, business_id into v_balance, v_business_id
  from memberships where id = p_membership_id for update;

  if v_balance is null or v_balance < 1 then
    return false;
  end if;

  update memberships
  set credits_balance = credits_balance - 1,
      credits_used_this_period = credits_used_this_period + 1
  where id = p_membership_id;

  insert into membership_credit_ledger (
    membership_id, business_id, delta, balance_after, reason, appointment_id
  ) values (
    p_membership_id, v_business_id, -1, v_balance - 1, 'redemption', p_appointment_id
  );

  update appointments
  set membership_id = p_membership_id, paid_with_credit = true
  where id = p_appointment_id;

  return true;
end;
$$;
