-- ============================================================================
-- 0014 — IMPACT
-- ============================================================================
-- One row per business answering the only question that renews a contract:
-- what changed since this went live, and what was it worth?
--
-- Every other view here reports a current state. This one reports a delta,
-- against the business's own first thirty days rather than an industry
-- benchmark — an owner will argue with a benchmark and cannot argue with
-- their own opening numbers.
--
-- Three deltas, each convertible to money without any modelling:
--
--   rebooking rate   × visits × average ticket = future revenue now on the books
--   no-show rate     × bookings × average ticket = revenue that stopped walking out
--   membership MRR   now vs then = recurring revenue that did not exist before
--
-- `comparable` is false until there are sixty days of history, because before
-- that the baseline and current windows overlap and the deltas are noise. The
-- UI must respect it. A fabricated improvement in month one is worse than no
-- number at all — it is the number the client will remember when the real one
-- disagrees.
-- ============================================================================

create or replace view v_impact as

with history as (
  select
    business_id,
    min(coalesce(completed_at, starts_at)) as first_activity,
    count(*)                               as lifetime_appointments
  from appointments
  group by business_id
),

windows as (
  select
    business_id,
    first_activity,
    lifetime_appointments,
    first_activity                              as baseline_start,
    first_activity + interval '30 days'         as baseline_end,
    now() - interval '30 days'                  as current_start,
    now()                                       as current_end,
    extract(day from now() - first_activity)::integer as days_live
  from history
),

-- Attendance and rebooking for a window, computed twice against the same
-- definitions so the two halves of the comparison cannot drift apart.
appointment_stats as (
  select
    w.business_id,
    p.period,
    count(a.*)                                                       as booked,
    count(a.*) filter (where a.status = 'completed')                 as completed,
    count(a.*) filter (where a.status = 'no_show')                   as no_shows,
    round(100.0 * count(a.*) filter (where a.status = 'no_show')
          / nullif(count(a.*), 0), 2)                                as no_show_rate,
    coalesce(
      avg(a.price_cents + a.addons_cents)
        filter (where a.status = 'completed'), 0
    )::bigint                                                        as avg_ticket_cents,
    coalesce(
      sum(a.cancellation_fee_cents + a.no_show_fee_cents), 0
    )::bigint                                                        as fees_recovered_cents
  from windows w
  cross join lateral (
    values ('baseline', w.baseline_start, w.baseline_end),
           ('current',  w.current_start,  w.current_end)
  ) as p(period, from_at, to_at)
  left join appointments a
    on a.business_id = w.business_id
   and a.starts_at >= p.from_at
   and a.starts_at <  p.to_at
  group by w.business_id, p.period
),

-- Did the client leave with a next visit on the books? Same definition as
-- v_rebooking_rate, restricted to the window.
rebooking_stats as (
  select
    w.business_id,
    p.period,
    count(a.*)                                       as completed_visits,
    count(a.*) filter (where fut.id is not null)     as left_with_next_booked,
    round(100.0 * count(a.*) filter (where fut.id is not null)
          / nullif(count(a.*), 0), 1)                as rebook_rate
  from windows w
  cross join lateral (
    values ('baseline', w.baseline_start, w.baseline_end),
           ('current',  w.current_start,  w.current_end)
  ) as p(period, from_at, to_at)
  left join appointments a
    on a.business_id = w.business_id
   and a.status = 'completed'
   and a.completed_at >= p.from_at
   and a.completed_at <  p.to_at
  left join lateral (
    select f.id from appointments f
    where f.client_id = a.client_id
      and f.starts_at > a.completed_at
      and f.created_at between a.completed_at - interval '1 day'
                           and a.completed_at + interval '7 days'
    limit 1
  ) fut on true
  group by w.business_id, p.period
),

-- MRR reconstructed at a point in time from when each membership started and
-- stopped. A snapshot table would drift; this cannot.
mrr_at as (
  select
    w.business_id,
    p.period,
    coalesce(sum(
      case pl.billing_interval
        when 'year' then pl.price_cents / 12
        else pl.price_cents / greatest(pl.interval_count, 1)
      end
    ), 0)::bigint as mrr_cents,
    count(m.*)    as members
  from windows w
  cross join lateral (
    values ('baseline', w.baseline_end),
           ('current',  w.current_end)
  ) as p(period, as_of)
  left join memberships m
    on m.business_id = w.business_id
   and m.started_at <= p.as_of
   and (m.cancelled_at is null or m.cancelled_at > p.as_of)
   and m.status <> 'paused'
  left join membership_plans pl on pl.id = m.plan_id
  group by w.business_id, p.period
)

select
  w.business_id,
  w.first_activity,
  w.days_live,
  w.lifetime_appointments,
  -- Below sixty days the windows overlap; the deltas are not yet meaningful.
  (w.days_live >= 60)                                        as comparable,

  base_r.rebook_rate                                         as rebook_rate_baseline,
  curr_r.rebook_rate                                         as rebook_rate_current,
  coalesce(curr_r.rebook_rate, 0) - coalesce(base_r.rebook_rate, 0)
                                                             as rebook_rate_delta,

  base_a.no_show_rate                                        as no_show_rate_baseline,
  curr_a.no_show_rate                                        as no_show_rate_current,
  coalesce(curr_a.no_show_rate, 0) - coalesce(base_a.no_show_rate, 0)
                                                             as no_show_rate_delta,

  curr_a.booked                                              as booked_current,
  curr_a.completed                                           as completed_current,
  curr_a.avg_ticket_cents                                    as avg_ticket_cents,
  base_a.avg_ticket_cents                                    as avg_ticket_cents_baseline,
  curr_a.fees_recovered_cents                                as fees_recovered_cents,

  base_m.mrr_cents                                           as mrr_cents_baseline,
  curr_m.mrr_cents                                           as mrr_cents_current,
  curr_m.mrr_cents - base_m.mrr_cents                        as mrr_cents_delta,
  curr_m.members                                             as members_current,

  -- --- Value, in cents per month ------------------------------------------
  -- Extra visits now on the books because more people rebooked, priced at the
  -- current average ticket. Floored at zero: a decline is reported as a rate,
  -- not as negative money.
  greatest(
    round(
      (coalesce(curr_r.rebook_rate, 0) - coalesce(base_r.rebook_rate, 0)) / 100.0
      * coalesce(curr_r.completed_visits, 0)
      * coalesce(curr_a.avg_ticket_cents, 0)
    ), 0
  )::bigint                                                  as rebooking_value_cents,

  -- Appointments that would have been no-shows at the old rate and were not.
  greatest(
    round(
      (coalesce(base_a.no_show_rate, 0) - coalesce(curr_a.no_show_rate, 0)) / 100.0
      * coalesce(curr_a.booked, 0)
      * coalesce(curr_a.avg_ticket_cents, 0)
    ), 0
  )::bigint                                                  as no_show_value_cents,

  greatest(curr_m.mrr_cents - base_m.mrr_cents, 0)::bigint   as membership_value_cents

from windows w
left join rebooking_stats  base_r on base_r.business_id = w.business_id and base_r.period = 'baseline'
left join rebooking_stats  curr_r on curr_r.business_id = w.business_id and curr_r.period = 'current'
left join appointment_stats base_a on base_a.business_id = w.business_id and base_a.period = 'baseline'
left join appointment_stats curr_a on curr_a.business_id = w.business_id and curr_a.period = 'current'
left join mrr_at           base_m on base_m.business_id = w.business_id and base_m.period = 'baseline'
left join mrr_at           curr_m on curr_m.business_id = w.business_id and curr_m.period = 'current';

comment on view v_impact is
  'Before-and-after against the business''s own first 30 days. `comparable` is false until 60 days of history exist — do not render deltas before then.';
