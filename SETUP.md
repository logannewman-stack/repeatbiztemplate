# Standing up a client

> **Two repos.** This one is the app your customer books in. The staff side —
> calendar, checkout, clients, retention, reports — lives in
> [repeatbizadmintemplate](https://github.com/logannewman-stack/repeatbizadmintemplate)
> and deploys separately to its own domain. Give the client a branch of the
> same name in both, point both at one Supabase project, and work through this
> guide with both checked out. Steps below that say "back office" happen there.

> **Showing this to a prospect?** Deploy it with no Supabase configured and it
> runs as a working demo with sample data throughout, and no setup banners —
> those only appear under `npm run dev`, or when you set
> `NEXT_PUBLIC_SETUP_HINTS=1`. Turn that on while you configure a real client,
> and take it off before they open the link.

Start to finish for one business. Roughly half a day the first time; an hour or
two once you have a rhythm.

Nothing here requires the previous step to be finished — the app degrades
gracefully. No Supabase means demo mode. No Stripe means payments are disabled
but booking still works. No messaging provider means sends are logged instead of
delivered. That is deliberate: you can demo the product on day one and wire the
plumbing as the client signs.

---

## 0. Fork and run

```bash
git clone <this-repo> client-name
cd client-name
rm -rf .git && git init
npm install
npm run dev
```

<http://localhost:3000> works immediately in demo mode.

---

## 1. Two ways to configure

Everything client-specific can be set **in the browser**, at `/setup` in the back office
once Supabase is connected, or **in code** before you deploy. Both write to the
same places; the database wins at runtime.

| | Back office `/setup` | Code (`src/config/*`) |
|---|---|---|
| Takes effect | Immediately | Next deploy |
| Who can do it | The client, or you | You |
| Best for | Everything, normally | Pre-branding a fork before handover |

**Recommended: skip to step 2, deploy, then do it all in the wizard.** The rest
of this section covers the code route for when you want a fork that arrives
already branded.

### The code route

`src/config/brand.ts` — name, tagline, colors (OKLCH), fonts, contact details,
asset paths:

```ts
export const brand: BrandConfig = {
  name: 'Wildflower Hair Studio',
  shortName: 'Wildflower',
  tagline: 'Book your next visit before you leave.',
  vertical: 'hair_salon',
  slug: 'wildflower-hair',
  contact: { phone: '(555) 123-4567', email: 'hello@wildflowerhair.com', ... },
  colors: { brand: 'oklch(0.52 0.13 250)', ... },
};
```

Colors are OKLCH. If you have a hex from the client's brand guide, the wizard
converts it for you — or use `hexToOklch()` from `src/lib/brand.ts`. OKLCH keeps
perceived lightness consistent when hover and muted states are derived from the
base color, which hex does not.

Replace the placeholders in `public/brand/` (`logo.svg`, `logo-mark.svg`,
`icon-192.svg`, `icon-512.svg`, `og.svg`, `hero.svg`). Uploading through the
wizard writes to Supabase Storage instead and overrides these.

---

## 2. Vertical and catalog

`brand.vertical` selects a preset from `src/config/verticals.ts` covering
vocabulary, default services with realistic durations and prices, add-ons,
membership shapes, retail, and rebooking intervals.

Available: `hair_salon`, `nail_salon`, `med_spa`, `massage`, `barbershop`,
`lash_brow`, `waxing`, `tanning`, `pet_grooming`, `chiropractic`,
`physical_therapy`, `dental`, `personal_training`, `auto_detailing`, `generic`.

In the wizard, the **Services** step imports the whole preset into the database
in one click, then you edit it in Admin → Services. The import is idempotent —
re-running it only adds what is missing.

Two fields do most of the work:

- **`rebookIntervalDays`** drives the pre-selected date on the rebooking prompt,
  the "due for a visit" query, and the lapse threshold. Get it roughly right and
  the retention engine works; leave it wrong and it nags people at the wrong
  time. Sanity-check every one of these with the owner.
- **`processingMin`** is the gap where the provider is free — color developing,
  laser cooling, a mask setting. The availability engine books a second client
  into that window, which is the single largest capacity gain available to a
  colour-heavy salon. Leave it `0` if there is no such gap.

---

## 3. Rules — 20 minutes

`src/config/rules.ts` is every revenue and retention lever, documented inline.
Walk through it with the owner. The ones worth actually discussing:

| Setting | Why it matters |
|---|---|
| `cancellation.freeCancellationHours` | 24 is standard; 48 for high-value med spa work |
| `cancellation.feeTiers` | Tiered beats a flat fee — it stays proportionate |
| `cancellation.rescheduleFirst` | Leave `true`. A reschedule keeps the revenue |
| `deposits.requireAboveCents` | Below this, deposits cost more conversion than they save |
| `deposits.waiveForMembers` | Leave `true`. It is a felt membership benefit |
| `rebooking.nudgeDayOffsets` | `[0, 5, 14]` is a reasonable default. More than three touches annoys |
| `lapse.lapseMultiplier` | 2x cadence. Lower for med spa, higher for nails |
| `memberships.saveFlow.offers` | Order matters — pause first, discount last |
| `reviews.publicReviewUrl` | **Must be replaced.** Points at a placeholder domain |

These can also be overridden per-business at runtime through the
`businesses.policy` JSONB column, so an owner can shorten their cancellation
window at 9pm on a Friday without a deploy.

---

## 4. Supabase — 45 minutes

### Create the project

1. <https://supabase.com/dashboard> → New project
2. Pick a region near the client's customers
3. Save the database password somewhere real

### Get the keys

Project Settings → API:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...   # server only, never NEXT_PUBLIC_
NEXT_PUBLIC_BUSINESS_SLUG=wildflower-hair
```

### Run the migrations

With the Supabase CLI:

```bash
npx supabase link --project-ref abcdefgh
npx supabase db push
```

Or paste each file from `supabase/migrations/` into the SQL editor in
filename order. They must run in order — later ones depend on earlier types.

### Seed

`supabase/seed.sql` creates 123 Example Studio with three providers, a service
catalog, two membership plans, message templates, and sixteen campaigns.

For a real client: run it, then rename the business, replace the services, and
delete the placeholder staff. Keeping the campaign and template rows is the
point — those are the retention engine, and rebuilding them by hand is a waste
of an afternoon.

For a demo, also run `supabase/demo-history.sql` to generate 120 clients with
nine months of history so the dashboards have real shapes. **Never run that
against a production project.**

### Verify

```sql
select name, slug from businesses;
select count(*) from campaigns;      -- expect 16
select count(*) from message_templates;
```

### Auth

Authentication → URL Configuration:
- Site URL: your production domain
- Redirect URLs: add `https://yourdomain.com/auth/callback` and
  `http://localhost:3000/auth/callback`

Email templates: rewrite the magic-link email in the client's voice. The
default Supabase copy looks like software, not like a salon.

### Types

After any schema change:

```bash
npm run db:types
```

---

## 4b. Run the setup wizard — 20 minutes

With Supabase connected, open **`/setup` in the back office** and work through the five
steps. This is where a client build actually gets configured:

1. **Business** — name, type, contact, address, timezone, currency, tax rate.
   The business type sets the vocabulary used everywhere: client vs. patient,
   stylist vs. injector, appointment vs. session.
2. **Look** — upload the logo, the square app icon, and a real hero photo, then
   pick one brand color. The rest of the palette is derived from it, and a live
   preview shows the actual booking card as you change things. Corner style
   (sharp / soft / round) sets the radius scale.
3. **Services** — import the vertical's starter menu in one click, then edit
   prices in Admin → Services.
4. **Team** — add each provider. They can perform every service by default.
5. **Hours** — weekly opening hours. Nothing can be booked outside these,
   whatever a provider's own schedule says.

Then set each provider's weekly schedule in **Admin → Team → Schedule**. Split
shifts are supported — add more than one shift to a day and the hours in
between stay unbookable.

**Nobody can book until a provider has both a schedule and at least one
assigned service.** The Team page flags both conditions in red.

Logos and photos upload to Supabase Storage. Migration `0011_storage.sql`
creates three buckets: `brand` and `media` are public (they are embedded in
emails and served from a CDN), `client` is private and reachable only through a
signed URL — that is where before/after photos and signed consent forms go.

---

## 5. Stripe — 45 minutes

### Keys

Developers → API keys:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Stay in test mode until the client has signed off on pricing.

### Webhook

The webhook is not optional. It is the only place a purchase is treated as
complete — success redirects are never trusted, because a client can close the
tab and a redirect URL can be forged.

Local:
```bash
npm run stripe:listen
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET
```

Production: Developers → Webhooks → Add endpoint →
`https://yourdomain.com/api/stripe/webhook`, subscribing to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.refunded`

### Membership products

Products and prices are created automatically the first time someone checks
out on a plan (`syncPlanToStripe`). You do not need to create them by hand.

Existing prices are never mutated — changing a price in place would silently
re-bill existing members at the new rate.

### Test the money paths before launch

- [ ] Deposit on a booking, then confirm `appointments.deposit_paid_at` is set
- [ ] Membership signup, then confirm a `memberships` row with credits granted
- [ ] Failed payment (card `4000 0000 0000 0341`) → status `past_due`, dunning message
- [ ] Cancel a membership → save offers appear before the cancel confirms
- [ ] Late-cancel an appointment → fee is quoted before it is charged

---

## 6. Messaging — 30 minutes

Both adapters no-op until configured. Sends are still recorded in
`campaign_sends`, so the campaign engine and its dashboards work end to end
before either provider exists.

### Email (Resend)

```env
RESEND_API_KEY=re_...
EMAIL_FROM="Wildflower Hair <hello@wildflowerhair.com>"
```

Verify the sending domain in Resend, including DKIM. Unverified domains land in
spam, and a confirmation email in spam is a no-show.

### SMS (Twilio)

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=MG...
```

**Register an A2P 10DLC campaign before sending marketing texts in the US.**
Unregistered traffic gets filtered by the carriers, and the client will
reasonably conclude the software is broken.

Keep opt-out language in every marketing template. Reminders and confirmations
are transactional and exempt; "you're due for a visit" is not.

### Rewrite the copy

The seeded templates are deliberately plain. Rewrite them in the client's voice
before going live — these messages are the client's relationship with their
customers, and generic copy reads like spam.

---

## 7. Deploy to Vercel — 20 minutes

```bash
npm run preflight   # reports what is missing before you find out the hard way
npx vercel
```

Add every variable from `.env.local` in the Vercel dashboard, plus:

```env
NEXT_PUBLIC_APP_URL=https://yourdomain.com
CRON_SECRET=<long random string>
```

### `NEXT_PUBLIC_*` is baked in at build time

Not read at runtime. Adding Supabase credentials in the Vercel dashboard
after a deploy changes nothing until you **redeploy**. The same applies in
reverse: a build made with credentials keeps them even if you remove the
values. Whenever you change one, rebuild.

### Cron jobs and your Vercel plan

This is the one thing that will reject a deployment outright, so it is worth
understanding before you hit it.

| | Cron jobs | Schedules |
|---|---|---|
| **Hobby** | 2 maximum | Once per day only |
| **Pro** | 40 | Any |

The platform has **seven** automations, three of which want to run more than
once a day. Declaring them individually in `vercel.json` fails on Hobby with
an error before the build even starts.

So they do not run individually. `vercel.json` schedules **one** endpoint —
`/api/cron/run` — which dispatches all seven, running whichever are due. Each
job declares a minimum interval in `src/lib/cron-jobs/index.ts`, so the same
code does the right thing at any trigger frequency.

**The shipped config runs every 15 minutes**, which needs a Pro plan. Reminders
fire hourly, the waitlist fills within fifteen minutes, and the slower jobs run
at their own cadence.

**On Hobby**, change the schedule to `0 9 * * *` — one daily entry, which is
inside the 2-job / daily-only limit. Everything still runs, once a day. That is
a real degradation and it is worth being honest about what it costs:

| Automation | Cost of running only daily |
|---|---|
| Reminders | A 3-hour reminder cannot exist. Confirmations go out late, and unconfirmed appointments no-show more. |
| Waitlist fill | A slot freed at 10am is not offered until the next morning — usually too late to fill it. |
| Rebooking nudges | Fine. A day either side of "you're due" makes no difference. |
| Winback, reviews, membership health, metrics | Fine. All are daily-or-slower by nature. |

Nothing else changes when you switch either way. The dispatcher already knows
each job's cadence; only the trigger frequency differs.

**Prefer separate cron entries on Pro?** Every job is still individually
reachable at `/api/cron/<key>`. Replace the single entry with one per job on
whatever schedule you like — the dispatcher and the individual routes call the
same code.

**Not on Vercel, or want sub-daily on Hobby?** Point any external scheduler
(GitHub Actions, cron-job.org, an EC2 crontab) at:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/run
```

Hitting it every 15 minutes gives you the full Pro behaviour on a Hobby plan.

### Verifying the automations actually run

`CRON_SECRET` is required — the routes refuse to run without it rather than
running unauthenticated, so a missing secret means every automation 500s.

```bash
# Run whatever is due
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/run

# Force one job regardless of when it last ran
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://yourdomain.com/api/cron/run?jobs=winback"

# Force everything
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://yourdomain.com/api/cron/run?force=1"
```

The response lists what ran, what was skipped and when it is next due. Every
run is also recorded in the `cron_runs` table, which is how you answer "did
the automations run last night?" once the thing is live.

### Function timeouts

Each route sets its own `maxDuration` — 60s for cron, 30s for the Stripe
webhook. That lives in the route files rather than `vercel.json`, which is kept
minimal because Vercel rejects any unrecognised property there and a `functions`
glob that matches nothing is a deploy error in itself. If a client list grows large enough for `refresh-metrics` to
time out, run it against a smaller page size or move it to a Pro plan with a
longer limit — it pages through clients rather than loading them all, so it
degrades gracefully rather than falling over.

---

## 8. Go-live checklist

**Content**
- [ ] Setup wizard completed end to end
- [ ] Real logo, app icon, and hero photo uploaded
- [ ] Real services, durations, and prices
- [ ] Real staff with bios, photos, and weekly schedules
- [ ] Every provider has at least one assigned service
- [ ] `rebookIntervalDays` sanity-checked with the owner for every service
- [ ] Message templates rewritten in the client's voice
- [ ] `rules.reviews.publicReviewUrl` points at the real listing
- [ ] Demo clients removed if `demo-history.sql` was ever run

**Legal** — none of this is legal advice; get it reviewed
- [ ] Policies page reviewed by the owner
- [ ] Privacy policy and terms written for this business
- [ ] Consent forms reviewed by counsel for any med spa, chiropractic, dental,
      or health-adjacent build
- [ ] SMS opt-out language present in every marketing template
- [ ] A2P 10DLC registered

**Technical**
- [ ] Stripe in live mode, webhook pointed at production
- [ ] Test booking end to end on a real phone
- [ ] Confirmation email and SMS both received
- [ ] Auth redirect URLs include production
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-only in Vercel
- [ ] RLS confirmed on: sign in as a client, verify you cannot see other clients

**Handover**
- [ ] Owner walked through the dashboard and, specifically, the retention queue
- [ ] Front desk trained on the rebooking prompt at checkout — this is the
      single highest-value habit in the whole system, and it is a human habit,
      not a software feature
- [ ] Owner shown how to change policies from Settings

---

## Troubleshooting

**Everything says "demo mode"** — `NEXT_PUBLIC_SUPABASE_URL` still contains
`REPLACE_ME`, or the dev server wasn't restarted after editing `.env.local`.

**Demo mode and live mode disagree after a deploy** — `NEXT_PUBLIC_*` variables
are **inlined at build time**, not read at runtime. Whether a build runs in demo
mode is decided when `next build` runs, so adding Supabase credentials in Vercel
after a deploy changes nothing until you redeploy. The same applies in reverse:
a build made with credentials present stays in live mode even if you delete the
env file afterwards. Whenever you switch, rebuild.

**The booking page says "online booking is unavailable"** — the app is in live
mode but cannot reach the catalog: wrong keys, a paused Supabase project, or
migrations never run. It deliberately shows a phone number rather than falling
back to the demo catalog, because showing placeholder services and prices to a
real customer is worse than showing nothing. The underlying error is logged
server-side.

**Queries return nothing but the data exists** — RLS. Anonymous users only see
the public catalog. Server-side reads that need to bypass it must use
`createAdminClient()`, never the browser or SSR client.

**No available slots** — check in order: the provider is assigned to the
service (Admin → Team shows a red flag when they are not), a weekly schedule
exists for that weekday, `effective_from` is in the past, the location's
opening hours cover the day, and the date is inside `maxAdvanceBookingDays`.

**Uploads fail** — migration `0011_storage.sql` has not run, so the buckets do
not exist. Uploads are also capped at 5MB for brand assets and 10MB for photos,
and only PNG, JPG, WebP, SVG, and AVIF are accepted.

**Branding changes do not appear** — the wizard writes to `businesses.branding`
and the layout reads it per request, so a hard refresh is normally enough. If
you edited `src/config/brand.ts` instead, that is compiled in and needs a
rebuild.

**Stripe webhook 400s** — `STRIPE_WEBHOOK_SECRET` mismatch. The local
`stripe listen` secret and the production endpoint secret are different values.

**Vercel rejects the deployment over cron jobs** — the account is on Hobby and
`vercel.json` declares more than two, or one runs more than daily. The shipped
config has a single daily entry and deploys on any plan; if you edited it for
Pro and then moved the project to a Hobby account, revert that change. Run
`npm run preflight` to see which schedules are the problem.

**The automations never run** — check in order: `CRON_SECRET` is set in Vercel
(without it every route 500s), the deployment is on a plan whose cron actually
fired, and the `cron_runs` table has rows. A job with `last_status = 'error'`
carries the message in `last_error`.

**Messages aren't arriving** — check `campaign_sends`. A row with
`status = 'skipped'` carries a `skip_reason` explaining exactly why. A row with
`status = 'sent'` and no delivery means the provider is the problem, not the app.

**Double-booking** — should be impossible; the database enforces it with
exclusion constraints. If you see one, check whether something is writing to
`appointment_busy_blocks` directly instead of letting the trigger maintain it.
