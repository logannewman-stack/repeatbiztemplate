-- ============================================================================
-- SEED — "123 Example Studio"
-- ============================================================================
-- Everything here is placeholder data. No real business, person, or brand.
-- Running this gives you a demo with enough history that the dashboard,
-- retention queues, and campaign engine all have something real to show.
--
-- Replace wholesale when standing up a client:
--   1. Edit src/config/brand.ts and src/config/verticals.ts
--   2. Run `npm run seed:catalog` to regenerate services from the vertical
--   3. Import the client's real client list via /admin/settings/import
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Business + location
-- ---------------------------------------------------------------------------

insert into businesses (id, slug, name, legal_name, vertical, timezone, currency, tax_rate_bps, policy, features)
values (
  '00000000-0000-0000-0000-000000000001',
  'example-studio',
  '123 Example Studio',
  '123 Example Studio LLC',
  'generic',
  'America/New_York',
  'USD',
  700,
  '{"lapse": {"lapseMultiplier": 2.0}}'::jsonb,
  '{"memberships": true, "packages": true, "giftCards": true, "retail": true, "waitlist": true, "reviews": true, "referrals": true}'::jsonb
);

insert into locations (id, business_id, name, slug, phone, email, address_line1, city, region, postal_code, hours)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'Main Street',
  'main-street',
  '(555) 010-0123',
  'hello@example-studio.test',
  '123 Example Street',
  'Anytown',
  'NY',
  '10001',
  '[
    {"weekday": 0, "closed": true},
    {"weekday": 1, "open": "09:00", "close": "18:00", "closed": false},
    {"weekday": 2, "open": "09:00", "close": "20:00", "closed": false},
    {"weekday": 3, "open": "09:00", "close": "20:00", "closed": false},
    {"weekday": 4, "open": "09:00", "close": "20:00", "closed": false},
    {"weekday": 5, "open": "09:00", "close": "18:00", "closed": false},
    {"weekday": 6, "open": "09:00", "close": "16:00", "closed": false}
  ]'::jsonb
);

insert into rooms (id, business_id, location_id, name, kind, sort_order) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'Room 1', 'standard', 1),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'Room 2', 'standard', 2),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'Private Suite', 'premium', 3);

-- ---------------------------------------------------------------------------
-- Staff — placeholder names only
-- ---------------------------------------------------------------------------

insert into staff (id, business_id, role, display_name, title, bio, email, bookable, price_multiplier, commission_rate, color, sort_order) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'owner', 'Provider One', 'Senior Provider',
   'Placeholder bio. Replace with the real provider''s background, specialties, and training.',
   'provider.one@example-studio.test', true, 1.200, 0.40, '#4F7CAC', 1),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 'provider', 'Provider Two', 'Provider',
   'Placeholder bio. Replace with the real provider''s background, specialties, and training.',
   'provider.two@example-studio.test', true, 1.000, 0.35, '#7A9E7E', 2),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000001', 'provider', 'Provider Three', 'Junior Provider',
   'Placeholder bio. Replace with the real provider''s background, specialties, and training.',
   'provider.three@example-studio.test', true, 0.850, 0.30, '#C08552', 3),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000001', 'front_desk', 'Front Desk', 'Guest Services',
   null, 'frontdesk@example-studio.test', false, 1.000, 0, '#8E8E93', 4);

insert into staff_locations (staff_id, location_id)
select id, '00000000-0000-0000-0000-000000000101' from staff
where business_id = '00000000-0000-0000-0000-000000000001';

-- Weekly schedules: Tue-Sat for the two senior providers, Wed-Sun for the third.
-- effective_from is backdated so historical utilization reports have a
-- denominator. In a real build, set it to the provider's hire date.
insert into staff_schedules (staff_id, location_id, weekday, start_time, end_time, effective_from)
select s.id, '00000000-0000-0000-0000-000000000101', d.weekday, d.start_time, d.end_time,
       current_date - interval '2 years'
from staff s
cross join (values
  (2, '09:00'::time, '17:00'::time),
  (3, '09:00'::time, '19:00'::time),
  (4, '09:00'::time, '19:00'::time),
  (5, '09:00'::time, '17:00'::time),
  (6, '09:00'::time, '15:00'::time)
) as d(weekday, start_time, end_time)
where s.id in ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000302');

insert into staff_schedules (staff_id, location_id, weekday, start_time, end_time, effective_from)
select '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000101', d.weekday, d.start_time, d.end_time,
       current_date - interval '2 years'
from (values
  (3, '11:00'::time, '19:00'::time),
  (4, '11:00'::time, '19:00'::time),
  (5, '11:00'::time, '19:00'::time),
  (6, '09:00'::time, '15:00'::time)
) as d(weekday, start_time, end_time);

-- Standing lunch break for everyone, every working day.
insert into staff_time_off (staff_id, starts_at, ends_at, reason, recurrence)
select s.id,
       (current_date + time '13:00') at time zone 'America/New_York',
       (current_date + time '13:45') at time zone 'America/New_York',
       'Lunch', 'daily'
from staff s where s.bookable and s.business_id = '00000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

insert into service_categories (id, business_id, name, sort_order) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'Core Services', 1),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000001', 'Premium', 2),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000001', 'Consultations', 3);

insert into services (id, business_id, category_id, name, slug, description, duration_min, processing_time_min, finish_time_min, price_cents, member_price_cents, deposit_mode, deposit_percent, rebook_interval_days, sort_order) values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401',
   'Service A — Standard', 'service-a-standard',
   'Placeholder description for the studio''s most-booked service. Replace with real copy.',
   60, 0, 0, 8500, 7650, 'none', 0, 30, 1),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401',
   'Service B — Extended', 'service-b-extended',
   'Placeholder description for a longer version of the core service.',
   90, 25, 20, 12500, 11250, 'percent', 25, 45, 2),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401',
   'Service C — Express', 'service-c-express',
   'Placeholder description for a shorter, lower-priced maintenance visit.',
   30, 0, 0, 4500, 4050, 'none', 0, 21, 3),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000402',
   'Service D — Premium', 'service-d-premium',
   'Placeholder description for the highest-ticket offering.',
   120, 30, 25, 19500, 16575, 'percent', 25, 60, 4),
  ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000403',
   'New Client Consultation', 'new-client-consultation',
   'Complimentary 30-minute consultation for first-time clients.',
   30, 0, 0, 0, 0, 'none', 0, 30, 5);

insert into service_staff (service_id, staff_id)
select s.id, st.id
from services s
cross join staff st
where s.business_id = '00000000-0000-0000-0000-000000000001'
  and st.bookable and st.business_id = '00000000-0000-0000-0000-000000000001'
  -- The junior provider doesn't perform the premium service yet.
  and not (s.slug = 'service-d-premium' and st.display_name = 'Provider Three');

insert into addons (id, business_id, name, description, duration_min, price_cents, member_price_cents, sort_order) values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', 'Add-On One', 'Placeholder add-on. Highest attach rate — keep it first.', 15, 2500, 2250, 1),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000001', 'Add-On Two', 'Placeholder add-on with a longer duration.', 20, 3500, 3150, 2),
  ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000001', 'Add-On Three', 'Placeholder quick add-on, easy yes at checkout.', 10, 1500, 1350, 3);

insert into service_addons (service_id, addon_id, is_recommended, sort_order)
select s.id, a.id,
       a.id = '00000000-0000-0000-0000-000000000601',
       case a.id
         when '00000000-0000-0000-0000-000000000601' then 1
         when '00000000-0000-0000-0000-000000000602' then 2
         else 3 end
from services s cross join addons a
where s.business_id = '00000000-0000-0000-0000-000000000001'
  and a.business_id = '00000000-0000-0000-0000-000000000001'
  and s.slug <> 'new-client-consultation';

insert into products (id, business_id, name, sku, description, price_cents, member_price_cents, cost_cents, stock_quantity, replenish_days, sort_order) values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', 'Retail Product A', 'SKU-A-001', 'Placeholder retail item recommended after Service A.', 2800, 2520, 1200, 24, 60, 1),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000001', 'Retail Product B', 'SKU-B-002', 'Placeholder retail item, higher price point.', 3600, 3240, 1600, 18, 90, 2),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000001', 'Retail Product C', 'SKU-C-003', 'Placeholder impulse-buy item for the checkout counter.', 1900, 1710, 700, 40, 45, 3);

insert into service_products (service_id, product_id, sort_order)
select s.id, p.id, p.sort_order
from services s cross join products p
where s.business_id = '00000000-0000-0000-0000-000000000001'
  and p.business_id = '00000000-0000-0000-0000-000000000001'
  and s.slug in ('service-a-standard', 'service-b-extended', 'service-d-premium');

insert into packages (id, business_id, name, description, service_id, quantity, price_cents, compare_at_cents, expires_days, sort_order) values
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000001', 'Service A — 6 Pack',
   'Six visits, prepaid. Works out to roughly 17% off.',
   '00000000-0000-0000-0000-000000000501', 6, 42500, 51000, 365, 1),
  ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000001', 'Service C — 10 Pack',
   'Ten express visits, prepaid, valid for a year.',
   '00000000-0000-0000-0000-000000000503', 10, 37500, 45000, 365, 2);

-- ---------------------------------------------------------------------------
-- Membership plans — the MRR engine
-- ---------------------------------------------------------------------------

insert into membership_plans (id, business_id, name, slug, description, pitch, price_cents, billing_interval, included_credits, discount_pct, retail_discount_pct, perks, waives_deposits, priority_booking_days, rollover_periods, max_banked_credits, sort_order) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000001',
   'Essential Membership', 'essential',
   'One included visit each month plus member pricing on everything else.',
   'One visit a month plus 10% off everything else.',
   9900, 'month', 1, 10, 10,
   '["One included Service A visit each month", "10% off all additional services", "10% off retail", "Unused visits roll over for 3 months", "No deposit required"]'::jsonb,
   true, 0, 3, 3, 1),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000001',
   'Premium Membership', 'premium',
   'Two included visits each month, the deepest discount, and first access to the calendar.',
   'Two visits a month, 15% off, and priority booking.',
   17900, 'month', 2, 15, 15,
   '["Two included visits each month", "15% off all additional services", "15% off retail", "Priority booking — 7 days early access", "Unused visits roll over for 3 months", "No deposit required", "Complimentary add-on on your birthday"]'::jsonb,
   true, 7, 3, 6, 2);

-- ---------------------------------------------------------------------------
-- Message templates
-- ---------------------------------------------------------------------------

insert into message_templates (business_id, key, name, channel, subject, body, variables) values
  ('00000000-0000-0000-0000-000000000001', 'booking_confirmation', 'Booking confirmation', 'sms', null,
   'Hi {{client.first_name}}! You''re booked at {{business.name}} on {{appointment.date_time}} with {{staff.name}}. Need to change it? {{link.manage}}',
   '{client.first_name,business.name,appointment.date_time,staff.name,link.manage}'),

  ('00000000-0000-0000-0000-000000000001', 'booking_confirmation', 'Booking confirmation', 'email',
   'Your appointment at {{business.name}} is confirmed',
   E'Hi {{client.first_name}},\n\nYou''re all set for {{service.name}} on {{appointment.date_time}} with {{staff.name}}.\n\n{{business.address}}\n\nNeed to reschedule? {{link.manage}}\n\nSee you soon,\n{{business.name}}',
   '{client.first_name,business.name,service.name,appointment.date_time,staff.name,business.address,link.manage}'),

  ('00000000-0000-0000-0000-000000000001', 'reminder_24h', '24-hour reminder', 'sms', null,
   'Reminder: {{service.name}} tomorrow at {{appointment.time}} with {{staff.name}}. Reply C to confirm, or reschedule here: {{link.manage}}',
   '{service.name,appointment.time,staff.name,link.manage}'),

  ('00000000-0000-0000-0000-000000000001', 'reminder_3h', '3-hour reminder', 'sms', null,
   'See you at {{appointment.time}} today, {{client.first_name}}! {{business.address}}',
   '{appointment.time,client.first_name,business.address}'),

  -- The rebooking nudge. Short, specific, one tap. This is the money message.
  ('00000000-0000-0000-0000-000000000001', 'rebooking_nudge', 'Time to rebook', 'sms', null,
   'Hi {{client.first_name}} — you''re about due for your next {{service.name}}. {{staff.name}} has {{slot.suggested}} open. Grab it here: {{link.rebook}}',
   '{client.first_name,service.name,staff.name,slot.suggested,link.rebook}'),

  ('00000000-0000-0000-0000-000000000001', 'rebooking_nudge', 'Time to rebook', 'email',
   'Ready for your next visit, {{client.first_name}}?',
   E'Hi {{client.first_name}},\n\nIt''s been {{client.days_since_visit}} days since your last {{service.name}} — right around when most clients come back in.\n\n{{staff.name}} has {{slot.suggested}} open, and a few other times this week.\n\n{{link.rebook}}\n\n{{business.name}}',
   '{client.first_name,client.days_since_visit,service.name,staff.name,slot.suggested,link.rebook,business.name}'),

  ('00000000-0000-0000-0000-000000000001', 'winback', 'We miss you', 'email',
   'We''ve saved your spot, {{client.first_name}}',
   E'Hi {{client.first_name}},\n\nIt''s been a while — {{client.days_since_visit}} days since your last visit.\n\n{{offer.label}}\n\nUse code {{offer.code}} when you book: {{link.rebook}}\n\nHope to see you soon,\n{{business.name}}',
   '{client.first_name,client.days_since_visit,offer.label,offer.code,link.rebook,business.name}'),

  ('00000000-0000-0000-0000-000000000001', 'review_request', 'How did we do?', 'sms', null,
   'Thanks for coming in, {{client.first_name}}! How did {{staff.name}} do today? {{link.review}}',
   '{client.first_name,staff.name,link.review}'),

  ('00000000-0000-0000-0000-000000000001', 'waitlist_offer', 'A spot opened up', 'sms', null,
   'Good news {{client.first_name}} — {{slot.suggested}} just opened with {{staff.name}}. First to claim gets it: {{link.claim}} (expires in {{offer.expires_minutes}} min)',
   '{client.first_name,slot.suggested,staff.name,link.claim,offer.expires_minutes}'),

  ('00000000-0000-0000-0000-000000000001', 'membership_dunning', 'Payment issue', 'email',
   'We couldn''t process your membership payment',
   E'Hi {{client.first_name}},\n\nYour {{membership.plan_name}} payment didn''t go through. Your benefits stay active for {{membership.grace_days}} more days.\n\nUpdate your card here: {{link.billing}}\n\n{{business.name}}',
   '{client.first_name,membership.plan_name,membership.grace_days,link.billing,business.name}'),

  ('00000000-0000-0000-0000-000000000001', 'credit_expiring', 'Your credits expire soon', 'sms', null,
   '{{client.first_name}}, you have {{membership.credits}} membership credit(s) expiring {{membership.credits_expire_on}}. Book now: {{link.rebook}}',
   '{client.first_name,membership.credits,membership.credits_expire_on,link.rebook}'),

  ('00000000-0000-0000-0000-000000000001', 'no_show_followup', 'We missed you', 'sms', null,
   'We missed you today, {{client.first_name}}. Things come up — want to grab another time? {{link.rebook}}',
   '{client.first_name,link.rebook}'),

  -- The first-visit sequence. Four messages, each doing a different job.
  -- Whether a new client returns a second time is where retention is decided:
  -- first-visit clients come back at roughly half the rate of anyone who has
  -- already been twice, and one follow-up email does not move that.
  ('00000000-0000-0000-0000-000000000001', 'first_visit_thanks', 'First visit — thank you', 'email',
   'Thanks for coming in, {{client.first_name}}',
   E'Hi {{client.first_name}},\n\nThank you for trusting us with your first visit — it was a pleasure.\n\nA few things that will help it last:\n\n  • Give it 24 hours before anything heavy\n  • Ask us before you change products at home\n  • Anything at all feels off, reply to this email and we will sort it\n\nSee you next time,\n{{business.name}}',
   '{client.first_name,business.name}'),

  -- Day three, and the one people skip. Most first-visit churn is an unvoiced
  -- small dissatisfaction; a client who tells you is a client you can keep.
  ('00000000-0000-0000-0000-000000000001', 'first_visit_checkin', 'First visit — check in', 'sms', null,
   E'Hi {{client.first_name}}, {{staff.first_name}} here from {{business.name}}. Just checking how everything settled after your visit — happy with it? If anything is not quite right, tell me and we will fix it.',
   '{client.first_name,staff.first_name,business.name}'),

  ('00000000-0000-0000-0000-000000000001', 'first_visit_rebook', 'First visit — book the next one', 'email',
   '{{client.first_name}}, ready for your next visit?',
   E'Hi {{client.first_name}},\n\nMost people are ready again around now — about {{service.rebook_interval}} days after their last visit.\n\nThe times that go first are evenings and Saturdays, so if one of those suits you it is worth grabbing now:\n\n{{link.rebook}}\n\n{{business.name}}',
   '{client.first_name,service.rebook_interval,link.rebook,business.name}'),

  ('00000000-0000-0000-0000-000000000001', 'first_visit_lastcall', 'First visit — one more nudge', 'sms', null,
   E'{{client.first_name}} — still keeping a spot for you whenever you are ready. Book any time: {{link.rebook}}',
   '{client.first_name,link.rebook}'),

  ('00000000-0000-0000-0000-000000000001', 'membership_pitch', 'You''d save with a membership', 'email',
   '{{client.first_name}}, you''d have saved {{membership.savings}} last quarter',
   E'Hi {{client.first_name}},\n\nOver the last 90 days you spent {{client.spend_90d}} with us. On our {{membership.plan_name}} you''d have paid {{membership.would_have_paid}} — a savings of {{membership.savings}}.\n\n{{link.membership}}\n\n{{business.name}}',
   '{client.first_name,client.spend_90d,membership.plan_name,membership.would_have_paid,membership.savings,link.membership,business.name}');

-- ---------------------------------------------------------------------------
-- Campaigns — the retention engine, switched on by default
-- ---------------------------------------------------------------------------

insert into campaigns (business_id, key, name, description, trigger_type, config, channel, fallback_channel, template_key, cooldown_days, skip_if_future_booking, active) values
  ('00000000-0000-0000-0000-000000000001', 'confirm_booking', 'Booking confirmation',
   'Sent the moment a booking is made.', 'appointment_booked', '{}'::jsonb,
   'sms', 'email', 'booking_confirmation', 0, false, true),

  ('00000000-0000-0000-0000-000000000001', 'reminder_72h', '72-hour reminder',
   'Early reminder — far enough out that a reschedule still fills the slot.',
   'appointment_reminder', '{"hoursBefore": 72}'::jsonb,
   'sms', 'email', 'reminder_24h', 0, false, true),

  ('00000000-0000-0000-0000-000000000001', 'reminder_24h', '24-hour reminder',
   'The confirmation ask. Confirmed appointments no-show far less often.',
   'appointment_reminder', '{"hoursBefore": 24, "requireConfirmation": true}'::jsonb,
   'sms', 'email', 'reminder_24h', 0, false, true),

  ('00000000-0000-0000-0000-000000000001', 'reminder_3h', '3-hour reminder',
   'Day-of nudge with the address.', 'appointment_reminder', '{"hoursBefore": 3}'::jsonb,
   'sms', null, 'reminder_3h', 0, false, true),

  -- skip_if_future_booking is false on the first two: a thank-you and a check-in
  -- are about the visit they just had, not the next one, so someone who booked
  -- again on the way out still deserves both.
  ('00000000-0000-0000-0000-000000000001', 'first_visit_thanks', 'First visit — thank you',
   'Two hours after their first visit, while the result is fresh and they are pleased.',
   'first_visit_followup', '{"stage": "thanks", "afterHours": 2}'::jsonb,
   'email', null, 'first_visit_thanks', 0, false, true),

  ('00000000-0000-0000-0000-000000000001', 'first_visit_checkin', 'First visit — check in',
   'Day three. Catches the small dissatisfaction nobody would have mentioned, which is where most first-visit churn comes from.',
   'first_visit_followup', '{"stage": "checkin", "afterHours": 72}'::jsonb,
   'sms', 'email', 'first_visit_checkin', 0, false, true),

  ('00000000-0000-0000-0000-000000000001', 'first_visit_rebook', 'First visit — book the next one',
   'A week before they are due back, timed to the service''s own interval rather than a fixed number of days after the visit.',
   'first_visit_followup', '{"stage": "rebook", "relativeToInterval": -168}'::jsonb,
   'email', 'sms', 'first_visit_rebook', 0, true, true),

  ('00000000-0000-0000-0000-000000000001', 'first_visit_lastcall', 'First visit — one more nudge',
   'Ten days past due. The last message before they become an ordinary winback.',
   'first_visit_followup', '{"stage": "lastcall", "relativeToInterval": 240}'::jsonb,
   'sms', 'email', 'first_visit_lastcall', 0, true, true),

  ('00000000-0000-0000-0000-000000000001', 'rebook_due', 'Rebooking nudge — due',
   'Fires the day the client hits their personal rebooking interval.',
   'rebooking_nudge', '{"dayOffset": 0}'::jsonb,
   'sms', 'email', 'rebooking_nudge', 14, true, true),

  ('00000000-0000-0000-0000-000000000001', 'rebook_overdue_5', 'Rebooking nudge — 5 days late',
   'Second touch, different channel.', 'rebooking_nudge', '{"dayOffset": 5}'::jsonb,
   'email', 'sms', 'rebooking_nudge', 14, true, true),

  ('00000000-0000-0000-0000-000000000001', 'rebook_overdue_14', 'Rebooking nudge — 2 weeks late',
   'Last touch before the client moves to winback.',
   'rebooking_nudge', '{"dayOffset": 14}'::jsonb,
   'sms', 'email', 'rebooking_nudge', 14, true, true),

  ('00000000-0000-0000-0000-000000000001', 'winback_30', 'Winback — 30 days lapsed',
   'First paid offer. Cheapest incentive that still moves people.',
   'lapse_winback', '{"afterLapseDays": 30, "offerKind": "percent", "offerValue": 15}'::jsonb,
   'email', 'sms', 'winback', 45, true, true),

  ('00000000-0000-0000-0000-000000000001', 'winback_90', 'Winback — 90 days lapsed',
   'Best offer. Past this point the client is usually gone for good.',
   'lapse_winback', '{"afterLapseDays": 90, "offerKind": "percent", "offerValue": 25}'::jsonb,
   'email', 'sms', 'winback', 90, true, true),

  ('00000000-0000-0000-0000-000000000001', 'review_request', 'Review request',
   'Rating-gated: happy clients go public, unhappy ones reach the owner privately.',
   'review_request', '{"delayHours": 24}'::jsonb,
   'sms', 'email', 'review_request', 90, false, true),

  ('00000000-0000-0000-0000-000000000001', 'no_show_followup', 'No-show follow-up',
   'Recovers a meaningful share of no-shows if it goes out same day.',
   'no_show_followup', '{"delayHours": 2}'::jsonb,
   'sms', 'email', 'no_show_followup', 30, true, true),

  ('00000000-0000-0000-0000-000000000001', 'waitlist_offer', 'Waitlist offer',
   'Fires when a slot frees up. Turns a cancellation into revenue.',
   'waitlist_offer', '{"claimWindowMinutes": 30}'::jsonb,
   'sms', 'email', 'waitlist_offer', 0, false, true),

  ('00000000-0000-0000-0000-000000000001', 'membership_dunning', 'Failed payment recovery',
   'Four retries over a week before the membership pauses.',
   'membership_dunning', '{"retryDays": [1, 3, 5, 7]}'::jsonb,
   'email', 'sms', 'membership_dunning', 0, false, true),

  ('00000000-0000-0000-0000-000000000001', 'credit_expiring', 'Membership credits expiring',
   'Unused credits are churn risk — a member who never redeems cancels.',
   'membership_credit_expiring', '{"daysBefore": 7}'::jsonb,
   'sms', 'email', 'credit_expiring', 25, false, true),

  ('00000000-0000-0000-0000-000000000001', 'membership_pitch', 'Membership upsell',
   'Targets clients whose 90-day spend already exceeds the plan price.',
   'manual', '{"minSpend90dCents": 29700}'::jsonb,
   'email', null, 'membership_pitch', 120, false, true);

-- ---------------------------------------------------------------------------
-- Forms
-- ---------------------------------------------------------------------------

insert into forms (business_id, name, kind, description, schema, revalidate_days) values
  ('00000000-0000-0000-0000-000000000001', 'New Client Intake', 'intake',
   'Collected before the first visit.',
   '[
     {"id": "how_heard", "label": "How did you hear about us?", "type": "select", "required": true,
      "options": ["Google", "Instagram", "Referred by a friend", "Walked by", "Other"]},
     {"id": "allergies", "label": "Any allergies or sensitivities we should know about?", "type": "textarea", "required": false},
     {"id": "preferences", "label": "Anything you''d like us to know about your preferences?", "type": "textarea", "required": false},
     {"id": "emergency_contact", "label": "Emergency contact (name and phone)", "type": "text", "required": false}
   ]'::jsonb, 365),
  ('00000000-0000-0000-0000-000000000001', 'Service Consent', 'consent',
   'Placeholder consent form. Replace with language reviewed by the client''s own counsel.',
   '[
     {"id": "understands", "label": "I understand the nature of the service being provided.", "type": "checkbox", "required": true},
     {"id": "disclosed", "label": "I have disclosed all relevant health information.", "type": "checkbox", "required": true},
     {"id": "signature", "label": "Signature", "type": "signature", "required": true}
   ]'::jsonb, 365);

commit;
