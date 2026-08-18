-- ============================================================================
-- 0009 — REPORTING VIEWS
-- ============================================================================
-- Four numbers matter more than everything else on the dashboard:
--   MRR, rebooking rate, no-show/cancel rate, average ticket.
-- Each has a view here so the app never hand-rolls the definition twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- MRR — normalized to a monthly figure regardless of billing interval
-- ---------------------------------------------------------------------------
create or replace view v_mrr as
select
  m.business_id,
  count(*) filter (where m.status in ('active', 'trialing'))                as active_members,
  count(*) filter (where m.status = 'past_due')                            as past_due_members,
  count(*) filter (where m.status = 'paused')                              as paused_members,
  count(*) filter (where m.status = 'cancelling')                          as cancelling_members,
  -- Paused members are excluded from MRR: they aren't billing this month.
  coalesce(sum(
    case
      when m.status in ('active', 'trialing', 'past_due')
      then case p.billing_interval
             when 'year' then p.price_cents / 12
             else p.price_cents / greatest(p.interval_count, 1)
           end
      else 0
    end
  ), 0)::bigint                                                            as mrr_cents,
  coalesce(sum(
    case when m.status = 'paused'
      then case p.billing_interval
             when 'year' then p.price_cents / 12
             else p.price_cents / greatest(p.interval_count, 1)
           end
      else 0 end
  ), 0)::bigint                                                            as paused_mrr_cents,
  -- MRR that will disappear at period end unless a save offer lands.
  coalesce(sum(
    case when m.cancel_at_period_end and m.status = 'active'
      then case p.billing_interval
             when 'year' then p.price_cents / 12
             else p.price_cents / greatest(p.interval_count, 1)
           end
      else 0 end
  ), 0)::bigint                                                            as at_risk_mrr_cents
from memberships m
join membership_plans p on p.id = m.plan_id
group by m.business_id;

-- ---------------------------------------------------------------------------
-- Membership movement by month — new / churned / net
-- ---------------------------------------------------------------------------
create or replace view v_membership_movement as
with months as (
  select generate_series(
    date_trunc('month', now() - interval '11 months'),
    date_trunc('month', now()),
    interval '1 month'
  )::date as month
)
select
  b.id                                                                     as business_id,
  mo.month,
  count(distinct m.id) filter (
    where date_trunc('month', m.started_at)::date = mo.month
  )                                                                        as new_members,
  count(distinct m.id) filter (
    where date_trunc('month', m.cancelled_at)::date = mo.month
  )                                                                        as churned_members,
  count(distinct m.id) filter (
    where m.started_at < (mo.month + interval '1 month')
      and (m.cancelled_at is null or m.cancelled_at >= (mo.month + interval '1 month'))
  )                                                                        as active_members
from businesses b
cross join months mo
left join memberships m on m.business_id = b.id
group by b.id, mo.month
order by mo.month;

-- ---------------------------------------------------------------------------
-- Rebooking rate — the leading indicator for everything else
-- ---------------------------------------------------------------------------
-- Two definitions, both useful:
--   rebooked_at_visit  → the next visit was booked from the checkout prompt
--   has_next_booked    → the client left with any future appointment on the books
-- The second is the number to manage; the first tells you whether the
-- at-the-chair prompt is doing the work or the follow-up campaigns are.
-- ---------------------------------------------------------------------------
create or replace view v_rebooking_rate as
select
  a.business_id,
  date_trunc('month', a.completed_at)::date                                as month,
  count(*)                                                                 as completed_visits,
  count(*) filter (where nxt.id is not null)                               as rebooked_at_visit,
  count(*) filter (where fut.id is not null)                               as left_with_next_booked,
  round(100.0 * count(*) filter (where nxt.id is not null)
        / nullif(count(*), 0), 1)                                          as rebook_prompt_rate,
  round(100.0 * count(*) filter (where fut.id is not null)
        / nullif(count(*), 0), 1)                                          as rebook_rate
from appointments a
-- Did a later appointment cite this one as its origin?
left join lateral (
  select r.id from appointments r
  where r.rebooked_from_id = a.id
  limit 1
) nxt on true
-- Did the client leave with a next visit on the books? Counts any future
-- appointment booked from one day before the visit through the week after --
-- wide enough to catch the follow-up campaigns, tight enough to exclude a
-- booking made months earlier for an unrelated service.
left join lateral (
  select f.id from appointments f
  where f.client_id = a.client_id
    and f.starts_at > a.completed_at
    and f.created_at between a.completed_at - interval '1 day'
                         and a.completed_at + interval '7 days'
    and f.status in ('requested', 'booked', 'confirmed', 'completed')
  limit 1
) fut on true
where a.status = 'completed' and a.completed_at is not null
group by a.business_id, date_trunc('month', a.completed_at)
order by month desc;

-- ---------------------------------------------------------------------------
-- Attendance — cancellations and no-shows as a share of booked volume
-- ---------------------------------------------------------------------------
create or replace view v_attendance as
select
  business_id,
  date_trunc('month', starts_at)::date                                     as month,
  count(*)                                                                 as total_booked,
  count(*) filter (where status = 'completed')                             as completed,
  count(*) filter (where status = 'cancelled')                             as cancelled,
  count(*) filter (where status = 'cancelled' and cancellation_fee_cents > 0)
                                                                           as late_cancelled,
  count(*) filter (where status = 'no_show')                               as no_shows,
  count(*) filter (where status = 'rescheduled')                           as rescheduled,
  round(100.0 * count(*) filter (where status = 'no_show')
        / nullif(count(*), 0), 2)                                          as no_show_rate,
  round(100.0 * count(*) filter (where status = 'cancelled')
        / nullif(count(*), 0), 2)                                          as cancellation_rate,
  -- Revenue that walked out the door. The number that sells deposits.
  coalesce(sum(price_cents + addons_cents)
    filter (where status in ('cancelled', 'no_show')), 0)::bigint          as lost_revenue_cents,
  coalesce(sum(cancellation_fee_cents + no_show_fee_cents), 0)::bigint     as recovered_fee_cents
from appointments
group by business_id, date_trunc('month', starts_at)
order by month desc;

-- ---------------------------------------------------------------------------
-- Average ticket, broken out by what drove it
-- ---------------------------------------------------------------------------
create or replace view v_average_ticket as
select
  o.business_id,
  date_trunc('month', o.created_at)::date                                  as month,
  count(*)                                                                 as ticket_count,
  round(avg(o.total_cents))::integer                                       as avg_ticket_cents,
  round(avg(o.total_cents) filter (
    where exists (select 1 from order_items i
                  where i.order_id = o.id and i.kind = 'addon')
  ))::integer                                                              as avg_ticket_with_addon_cents,
  round(avg(o.total_cents) filter (
    where not exists (select 1 from order_items i
                      where i.order_id = o.id and i.kind = 'addon')
  ))::integer                                                              as avg_ticket_no_addon_cents,
  round(100.0 * count(*) filter (
    where exists (select 1 from order_items i
                  where i.order_id = o.id and i.kind = 'addon')
  ) / nullif(count(*), 0), 1)                                              as addon_attach_rate,
  round(100.0 * count(*) filter (
    where exists (select 1 from order_items i
                  where i.order_id = o.id and i.kind = 'product')
  ) / nullif(count(*), 0), 1)                                              as retail_attach_rate,
  coalesce(sum(o.total_cents), 0)::bigint                                  as revenue_cents,
  coalesce(sum(o.tip_cents), 0)::bigint                                    as tips_cents
from orders o
where o.status in ('paid', 'partially_refunded')
group by o.business_id, date_trunc('month', o.created_at)
order by month desc;

-- ---------------------------------------------------------------------------
-- Clients who need chasing, ranked by how much they're worth
-- ---------------------------------------------------------------------------
create or replace view v_clients_due as
select
  c.id                                                                     as client_id,
  c.business_id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.preferred_staff_id,
  cm.lifecycle,
  cm.last_visit_at,
  cm.next_expected_at,
  cm.lapse_at,
  cm.churn_risk,
  cm.no_show_risk,
  cm.lifetime_value_cents,
  cm.avg_ticket_cents,
  cm.avg_days_between_visits,
  cm.visit_count,
  extract(day from now() - cm.last_visit_at)::integer                      as days_since_visit,
  extract(day from now() - cm.next_expected_at)::integer                   as days_overdue,
  -- Rank by expected recovered value, not just by how late they are.
  (cm.avg_ticket_cents * cm.churn_risk / 100)::integer                     as priority_score
from clients c
join client_metrics cm on cm.client_id = c.id
where c.archived_at is null
  and cm.has_future_booking = false
  and cm.last_visit_at is not null
  and cm.next_expected_at <= now()
  and cm.lifecycle <> 'lead'
order by priority_score desc;

-- ---------------------------------------------------------------------------
-- Staff performance — rebook rate per provider is the coachable number
-- ---------------------------------------------------------------------------
create or replace view v_staff_performance as
select
  s.id                                                                     as staff_id,
  s.business_id,
  s.display_name,
  date_trunc('month', a.completed_at)::date                                as month,
  count(*)                                                                 as visits,
  count(distinct a.client_id)                                              as unique_clients,
  coalesce(sum(o.total_cents), 0)::bigint                                  as revenue_cents,
  round(avg(o.total_cents))::integer                                       as avg_ticket_cents,
  coalesce(sum(o.tip_cents), 0)::bigint                                    as tips_cents,
  count(*) filter (where exists (
    select 1 from appointments r where r.rebooked_from_id = a.id
  ))                                                                       as rebooked,
  round(100.0 * count(*) filter (where exists (
    select 1 from appointments r where r.rebooked_from_id = a.id
  )) / nullif(count(*), 0), 1)                                             as rebook_rate,
  round(100.0 * count(*) filter (where exists (
    select 1 from order_items i where i.order_id = o.id and i.kind = 'addon'
  )) / nullif(count(*), 0), 1)                                             as addon_attach_rate,
  round(100.0 * count(*) filter (where exists (
    select 1 from order_items i where i.order_id = o.id and i.kind = 'product'
  )) / nullif(count(*), 0), 1)                                             as retail_attach_rate
from staff s
join appointments a on a.staff_id = s.id and a.status = 'completed'
left join orders o on o.appointment_id = a.id and o.status in ('paid', 'partially_refunded')
group by s.id, s.business_id, s.display_name, date_trunc('month', a.completed_at);

-- ---------------------------------------------------------------------------
-- Retention cohorts — of clients acquired in month M, how many are still active?
-- ---------------------------------------------------------------------------
create or replace view v_retention_cohorts as
with cohort as (
  select
    cm.business_id,
    cm.client_id,
    date_trunc('month', cm.first_visit_at)::date as cohort_month
  from client_metrics cm
  where cm.first_visit_at is not null
),
visits as (
  select
    a.client_id,
    date_trunc('month', a.completed_at)::date as visit_month
  from appointments a
  where a.status = 'completed'
  group by a.client_id, date_trunc('month', a.completed_at)
)
select
  c.business_id,
  c.cohort_month,
  v.visit_month,
  -- Months since acquisition.
  (extract(year from age(v.visit_month, c.cohort_month)) * 12
   + extract(month from age(v.visit_month, c.cohort_month)))::integer      as month_offset,
  count(distinct c.client_id)                                              as retained_clients,
  (select count(distinct c2.client_id) from cohort c2
   where c2.cohort_month = c.cohort_month
     and c2.business_id = c.business_id)                                   as cohort_size
from cohort c
join visits v on v.client_id = c.client_id
group by c.business_id, c.cohort_month, v.visit_month
order by c.cohort_month desc, month_offset;

-- ---------------------------------------------------------------------------
-- Campaign ROI — which automations actually pay for themselves
-- ---------------------------------------------------------------------------
create or replace view v_campaign_performance as
select
  cs.business_id,
  cs.campaign_id,
  ca.name                                                                  as campaign_name,
  ca.trigger_type,
  ca.channel,
  date_trunc('month', cs.sent_at)::date                                    as month,
  count(*) filter (where cs.status in ('sent', 'delivered'))               as sent,
  count(*) filter (where cs.status = 'failed')                             as failed,
  count(*) filter (where cs.status = 'skipped')                            as skipped,
  count(*) filter (where cs.opened_at is not null)                         as opened,
  count(*) filter (where cs.clicked_at is not null)                        as clicked,
  count(*) filter (where cs.converted_at is not null)                      as converted,
  round(100.0 * count(*) filter (where cs.converted_at is not null)
        / nullif(count(*) filter (where cs.status in ('sent', 'delivered')), 0), 2)
                                                                           as conversion_rate,
  coalesce(sum(cs.conversion_value_cents), 0)::bigint                      as revenue_cents
from campaign_sends cs
left join campaigns ca on ca.id = cs.campaign_id
group by cs.business_id, cs.campaign_id, ca.name, ca.trigger_type, ca.channel,
         date_trunc('month', cs.sent_at)
order by month desc, revenue_cents desc;

-- ---------------------------------------------------------------------------
-- Capacity utilization — how full is the book?
-- ---------------------------------------------------------------------------
-- Booked minutes are aggregated first, then joined against the provider's
-- recurring weekly schedule. Correlating the schedule subquery directly
-- against the un-grouped appointment row would not be legal SQL.
-- ---------------------------------------------------------------------------
create or replace view v_utilization as
with booked as (
  select
    a.business_id,
    a.staff_id,
    date_trunc('week', a.starts_at)::date                                  as week,
    coalesce(sum(a.duration_min) filter (
      where a.status in ('completed', 'booked', 'confirmed', 'checked_in', 'in_progress')
    ), 0)                                                                  as booked_minutes
  from appointments a
  where a.staff_id is not null
  group by a.business_id, a.staff_id, date_trunc('week', a.starts_at)
),
scheduled as (
  select
    b.staff_id,
    b.week,
    coalesce(sum(
      extract(epoch from (ss.end_time - ss.start_time)) / 60
    ), 0)                                                                  as available_minutes
  from booked b
  left join staff_schedules ss
    on ss.staff_id = b.staff_id
   and ss.effective_from <= b.week
   and (ss.effective_to is null or ss.effective_to >= b.week)
  group by b.staff_id, b.week
)
select
  b.business_id,
  b.staff_id,
  b.week,
  b.booked_minutes,
  s.available_minutes,
  round(100.0 * b.booked_minutes / nullif(s.available_minutes, 0), 1)      as utilization_pct,
  greatest(s.available_minutes - b.booked_minutes, 0)                      as open_minutes
from booked b
join scheduled s on s.staff_id = b.staff_id and s.week = b.week;
