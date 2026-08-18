-- ============================================================================
-- DEMO HISTORY (optional)
-- ============================================================================
-- Generates ~120 placeholder clients with 9 months of appointment and order
-- history so the dashboard, retention queues, and cohort charts have real
-- shapes to render. Run AFTER seed.sql.
--
--   psql "$SUPABASE_DB_URL" -f supabase/demo-history.sql
--
-- Do NOT run this against a production build for a real client.
-- ============================================================================

begin;

do $$
declare
  v_business uuid := '00000000-0000-0000-0000-000000000001';
  v_location uuid := '00000000-0000-0000-0000-000000000101';
  v_client uuid;
  v_staff uuid;
  v_service uuid;
  v_service_price integer;
  v_service_duration integer;
  v_service_interval integer;
  v_appt uuid;
  v_order uuid;
  v_start timestamptz;
  v_visits integer;
  v_cadence integer;
  v_last timestamptz;
  v_prev_end timestamptz;
  v_created timestamptz;
  v_status appointment_status;
  v_roll numeric;
  v_addon_price integer;
  v_total integer;
  i integer;
  j integer;
  v_staff_ids uuid[];
  v_service_ids uuid[];
begin
  select array_agg(id) into v_staff_ids from staff
   where business_id = v_business and bookable;
  select array_agg(id) into v_service_ids from services
   where business_id = v_business and slug <> 'new-client-consultation';

  for i in 1..120 loop
    -- Client -----------------------------------------------------------
    insert into clients (
      business_id, first_name, last_name, email, phone,
      marketing_opt_in, sms_opt_in, source,
      preferred_location_id, preferred_staff_id
    ) values (
      v_business,
      'Client', 'Number ' || lpad(i::text, 3, '0'),
      'client' || lpad(i::text, 3, '0') || '@example.test',
      '(555) 01' || lpad((i % 100)::text, 2, '0') || '-' || lpad((1000 + i)::text, 4, '0'),
      (i % 4) <> 0, (i % 3) <> 0,
      (array['walk_in', 'referral', 'instagram', 'google', 'online'])[1 + (i % 5)],
      v_location,
      v_staff_ids[1 + (i % array_length(v_staff_ids, 1))]
    ) returning id into v_client;

    v_staff := v_staff_ids[1 + (i % array_length(v_staff_ids, 1))];
    v_service := v_service_ids[1 + (i % array_length(v_service_ids, 1))];

    select price_cents, duration_min, rebook_interval_days
      into v_service_price, v_service_duration, v_service_interval
      from services where id = v_service;

    -- A realistic mix: a few one-and-done, a solid core of regulars,
    -- and a handful of very loyal clients.
    v_visits := case
      when i % 10 = 0 then 1
      when i % 7  = 0 then 2
      when i % 3  = 0 then 4 + (i % 3)
      else 3 + (i % 5)
    end;

    -- Personal cadence varies around the service default.
    v_cadence := greatest(7, v_service_interval + ((i % 21) - 10));

    -- Stagger first visits across the last 9 months.
    v_last := now() - ((240 - (i % 200)) || ' days')::interval;
    v_prev_end := null;

    for j in 1..v_visits loop
      v_start := date_trunc('hour', v_last)
                 + ((9 + (i + j) % 8) || ' hours')::interval;
      -- Land it on a weekday the studio is open.
      if extract(dow from v_start) = 0 then
        v_start := v_start + interval '2 days';
      elsif extract(dow from v_start) = 1 then
        v_start := v_start + interval '1 day';
      end if;

      exit when v_start > now();

      -- Booking timestamp. Rebooked visits are created at the chair during
      -- the prior visit; everything else is booked a week or two ahead.
      -- Without this, every generated row would carry created_at = now() and
      -- the "left with next booked" metric would read zero.
      if v_prev_end is not null and (i + j) % 5 < 2 then
        v_created := v_prev_end;
      else
        v_created := v_start - ((7 + (i % 10)) || ' days')::interval;
      end if;

      -- Outcome mix: ~87% completed, ~8% cancelled, ~5% no-show.
      v_roll := ((i * 13 + j * 7) % 100) / 100.0;
      v_status := case
        when v_roll < 0.05 then 'no_show'::appointment_status
        when v_roll < 0.13 then 'cancelled'::appointment_status
        else 'completed'::appointment_status
      end;

      begin
        insert into appointments (
          business_id, location_id, client_id, staff_id, service_id,
          starts_at, ends_at, blocks_at, blocks_until, duration_min,
          status, source, price_cents,
          completed_at, cancelled_at, no_show_at,
          cancellation_fee_cents, no_show_fee_cents,
          -- Roughly 40% of visits produced an at-the-chair rebooking.
          rebooked_from_id, created_at
        ) values (
          v_business, v_location, v_client, v_staff, v_service,
          v_start, v_start + (v_service_duration || ' minutes')::interval,
          v_start, v_start + ((v_service_duration + 10) || ' minutes')::interval,
          v_service_duration,
          v_status,
          case when j = 1 then 'online'::booking_source
               when (i + j) % 5 < 2 then 'rebook_prompt'::booking_source
               else 'online'::booking_source end,
          v_service_price,
          case when v_status = 'completed' then v_start + (v_service_duration || ' minutes')::interval end,
          case when v_status = 'cancelled' then v_start - interval '2 days' end,
          case when v_status = 'no_show' then v_start end,
          case when v_status = 'cancelled' and v_roll < 0.09 then v_service_price / 4 else 0 end,
          case when v_status = 'no_show' then v_service_price else 0 end,
          case when j > 1 and (i + j) % 5 < 2 then v_appt else null end,
          v_created
        ) returning id into v_appt;
      exception when others then
        -- Overlap collisions in generated data are expected; skip them.
        v_last := v_last + (v_cadence || ' days')::interval;
        continue;
      end;

      -- Order for completed visits ------------------------------------
      if v_status = 'completed' then
        -- ~35% attach an add-on, ~15% buy retail.
        v_addon_price := case when (i + j) % 3 = 0 then 2500 else 0 end;
        v_total := v_service_price + v_addon_price
                   + case when (i + j) % 7 = 0 then 2800 else 0 end;

        insert into orders (
          business_id, client_id, appointment_id, location_id, staff_id,
          status, subtotal_cents, tax_cents, tip_cents, total_cents, closed_at, created_at
        ) values (
          v_business, v_client, v_appt, v_location, v_staff,
          'paid', v_total, round(v_total * 0.07), round(v_total * 0.18),
          v_total + round(v_total * 0.07) + round(v_total * 0.18),
          v_start + (v_service_duration || ' minutes')::interval,
          v_start + (v_service_duration || ' minutes')::interval
        ) returning id into v_order;

        insert into order_items (order_id, business_id, kind, reference_id, name_snapshot, unit_price_cents, total_cents, staff_id)
        select v_order, v_business, 'service', v_service, s.name, v_service_price, v_service_price, v_staff
        from services s where s.id = v_service;

        if v_addon_price > 0 then
          insert into order_items (order_id, business_id, kind, reference_id, name_snapshot, unit_price_cents, total_cents, from_upsell, staff_id)
          values (v_order, v_business, 'addon', '00000000-0000-0000-0000-000000000601', 'Add-On One', v_addon_price, v_addon_price, true, v_staff);
        end if;

        if (i + j) % 7 = 0 then
          insert into order_items (order_id, business_id, kind, reference_id, name_snapshot, unit_price_cents, total_cents, from_upsell, staff_id)
          values (v_order, v_business, 'product', '00000000-0000-0000-0000-000000000701', 'Retail Product A', 2800, 2800, true, v_staff);
        end if;

        update appointments set order_id = v_order where id = v_appt;
      end if;

      v_prev_end := v_start + (v_service_duration || ' minutes')::interval;
      v_last := v_last + (v_cadence || ' days')::interval;
    end loop;
  end loop;

  -- Memberships for ~18% of clients ------------------------------------
  insert into memberships (business_id, client_id, plan_id, status, current_period_start, current_period_end, credits_balance, started_at)
  select
    v_business, c.id,
    case when (row_number() over (order by c.created_at)) % 3 = 0
      then '00000000-0000-0000-0000-000000000902'::uuid
      else '00000000-0000-0000-0000-000000000901'::uuid end,
    case when (row_number() over (order by c.created_at)) % 11 = 0
      then 'past_due'::membership_status
      when (row_number() over (order by c.created_at)) % 17 = 0
      then 'paused'::membership_status
      else 'active'::membership_status end,
    date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
    (row_number() over (order by c.created_at)) % 3,
    now() - (((row_number() over (order by c.created_at)) * 7) || ' days')::interval
  from clients c
  where c.business_id = v_business
  order by c.created_at
  limit 22;

  -- A handful of churned memberships so the movement chart has shape.
  insert into memberships (business_id, client_id, plan_id, status, started_at, cancelled_at, cancellation_reason)
  select v_business, c.id, '00000000-0000-0000-0000-000000000901'::uuid, 'cancelled'::membership_status,
         now() - interval '200 days',
         now() - ((30 + (row_number() over (order by c.created_at)) * 9) || ' days')::interval,
         (array['Too expensive', 'Not using it enough', 'Moving away', 'Other'])[
           1 + ((row_number() over (order by c.created_at))::integer % 4)]
  from clients c
  where c.business_id = v_business
    and not exists (select 1 from memberships m where m.client_id = c.id)
  order by c.created_at desc
  limit 6;

  -- Reviews -------------------------------------------------------------
  insert into reviews (business_id, client_id, appointment_id, staff_id, rating, body, routed_public, requested_at, submitted_at)
  select
    v_business, a.client_id, a.id, a.staff_id,
    case when (row_number() over (order by a.completed_at)) % 9 = 0 then 3 else 5 end,
    'Placeholder review text.',
    (row_number() over (order by a.completed_at)) % 9 <> 0,
    a.completed_at + interval '1 day',
    a.completed_at + interval '2 days'
  from appointments a
  where a.business_id = v_business and a.status = 'completed'
    and a.completed_at > now() - interval '120 days'
  order by a.completed_at desc
  limit 40;

  -- Refresh every rollup once at the end rather than per-insert.
  perform refresh_client_metrics(c.id) from clients c where c.business_id = v_business;
end;
$$;

commit;

-- Quick sanity check on what was generated.
select
  (select count(*) from clients)                                     as clients,
  (select count(*) from appointments)                                as appointments,
  (select count(*) from appointments where status = 'completed')     as completed,
  (select count(*) from orders)                                      as orders,
  (select count(*) from memberships where status = 'active')         as active_members,
  (select mrr_cents from v_mrr limit 1)                              as mrr_cents;
