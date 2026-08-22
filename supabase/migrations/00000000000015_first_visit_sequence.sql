-- ===========================================================================
-- THE FIRST-VISIT SEQUENCE
-- ===========================================================================
-- Whether a new client comes back a second time is where retention is
-- actually decided: first-visit clients return at roughly half the rate of
-- anyone who has already been twice. That gap is the largest single number in
-- the research behind this platform, and one follow-up email does not move it.
--
-- Four messages, each doing a different job:
--
--   thanks     +2h    while the result is fresh and they are pleased
--   checkin    +3d    the one people skip and the one that matters most —
--                     most first-visit churn is an unvoiced small
--                     dissatisfaction, and a client who tells you about it is
--                     a client you can still keep
--   rebook     -7d    the offer, a week before they are due back
--   lastcall   +10d   one softer nudge before they fall into winback
--
-- This migration is for deployments that already have a business row. A fresh
-- install gets the same four from seed.sql, because a migration runs before the
-- seed creates the business and would otherwise insert nothing at all — which
-- is exactly how a feature ships doing nothing and nobody notices for a month.
-- Both are idempotent, so running both is fine.
-- ===========================================================================

-- --- Templates -------------------------------------------------------------

insert into message_templates (business_id, key, name, channel, subject, body, variables)
select
  b.id, t.key, t.name, t.channel::message_channel, t.subject, t.body, t.variables::text[]
from businesses b
cross join (values
  ('first_visit_thanks', 'First visit — thank you', 'email',
   'Thanks for coming in, {{client.first_name}}',
   E'Hi {{client.first_name}},\n\nThank you for trusting us with your first visit — it was a pleasure.\n\nA few things that will help it last:\n\n  • Give it 24 hours before anything heavy\n  • Ask us before you change products at home\n  • Anything at all feels off, reply to this email and we will sort it\n\nSee you next time,\n{{business.name}}',
   '{client.first_name,business.name}'),

  ('first_visit_checkin', 'First visit — check in', 'sms', null,
   E'Hi {{client.first_name}}, {{staff.first_name}} here from {{business.name}}. Just checking how everything settled after your visit — happy with it? If anything is not quite right, tell me and we will fix it.',
   '{client.first_name,staff.first_name,business.name}'),

  ('first_visit_rebook', 'First visit — book the next one', 'email',
   '{{client.first_name}}, ready for your next visit?',
   E'Hi {{client.first_name}},\n\nMost people are ready again around now — about {{service.rebook_interval}} days after their last visit.\n\nThe times that go first are evenings and Saturdays, so if one of those suits you it is worth grabbing now:\n\n{{link.rebook}}\n\n{{business.name}}',
   '{client.first_name,service.rebook_interval,link.rebook,business.name}'),

  ('first_visit_lastcall', 'First visit — one more nudge', 'sms', null,
   E'{{client.first_name}} — still keeping a spot for you whenever you are ready. Book any time: {{link.rebook}}',
   '{client.first_name,link.rebook}')
) as t(key, name, channel, subject, body, variables)
on conflict (business_id, key, channel) do nothing;

-- --- Campaigns -------------------------------------------------------------
-- `skip_if_future_booking` is false on the first two: a thank-you and a check-in
-- are about the visit they just had, not the next one, and someone who booked
-- again on the way out still deserves both.

insert into campaigns (
  business_id, key, name, description, trigger_type, config,
  channel, fallback_channel, template_key,
  cooldown_days, skip_if_future_booking, active
)
select
  b.id, c.key, c.name, c.description,
  'first_visit_followup'::campaign_trigger, c.config::jsonb,
  c.channel::message_channel, c.fallback::message_channel, c.template_key,
  0, c.skip_future, true
from businesses b
cross join (values
  ('first_visit_thanks', 'First visit — thank you',
   'Sent two hours after their first visit, while the result is fresh.',
   '{"stage": "thanks", "afterHours": 2}', 'email', null,
   'first_visit_thanks', false),

  ('first_visit_checkin', 'First visit — check in',
   'Day three. Catches the small dissatisfaction nobody would have mentioned, which is where most first-visit churn actually comes from.',
   '{"stage": "checkin", "afterHours": 72}', 'sms', 'email',
   'first_visit_checkin', false),

  ('first_visit_rebook', 'First visit — book the next one',
   'A week before they are due back, timed to the service''s own interval rather than a fixed number of days.',
   '{"stage": "rebook", "relativeToInterval": -168}', 'email', 'sms',
   'first_visit_rebook', true),

  ('first_visit_lastcall', 'First visit — one more nudge',
   'Ten days past due. The last message before they become an ordinary winback.',
   '{"stage": "lastcall", "relativeToInterval": 240}', 'sms', 'email',
   'first_visit_lastcall', true)
) as c(key, name, description, config, channel, fallback, template_key, skip_future)
on conflict (business_id, key) do nothing;

-- The original single follow-up is superseded by the four above. Left in place
-- but switched off, so a business that customised its copy can still find it.
update campaigns
   set active = false,
       description = coalesce(description, '') ||
         ' (Superseded by the four-stage first-visit sequence.)'
 where key = 'first_visit_followup'
   and active;
