# Standing up a client

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

## 1. Brand — 20 minutes

Edit `src/config/brand.ts`:

```ts
export const brand: BrandConfig = {
  name: 'Wildflower Hair Studio',
  shortName: 'Wildflower',
  tagline: 'Book your next visit before you leave.',
  vertical: 'hair_salon',        // ← this drives a lot; see step 2
  slug: 'wildflower-hair',
  contact: { phone: '(555) 123-4567', email: 'hello@wildflowerhair.com', ... },
  colors: { brand: 'oklch(0.52 0.13 250)', ... },
  ...
};
```

Colors are OKLCH. If you have a hex from the client's brand guide, convert it —
OKLCH keeps perceived lightness consistent when you derive hover and muted
states, which hex does not.

Replace the placeholders in `public/brand/`:

| File | Used for |
|---|---|
| `logo.svg` | Header |
| `logo-mark.svg` | Compact header, admin sidebar |
| `icon-192.svg`, `icon-512.svg` | PWA install icons |
| `og.svg` | Link previews |
| `hero.svg` | Landing page hero |

Reload. The whole app is now branded.

---

## 2. Vertical and catalog — 30 minutes

Setting `vertical` in `brand.ts` loads a preset from
`src/config/verticals.ts` covering vocabulary, default services with realistic
durations and prices, add-ons, membership shapes, retail, and rebooking
intervals.

Available: `hair_salon`, `nail_salon`, `med_spa`, `massage`, `barbershop`,
`lash_brow`, `waxing`, `tanning`, `pet_grooming`, `chiropractic`,
`physical_therapy`, `dental`, `personal_training`, `auto_detailing`, `generic`.

Then adjust the preset to the client's real menu. The field that matters most:

```ts
{ name: 'Root Touch-Up', durationMin: 90, processingMin: 35,
  priceCents: 11000, rebookIntervalDays: 28, category: 'Color' }
```

- **`rebookIntervalDays`** drives the pre-selected date on the rebooking prompt,
  the "due for a visit" query, and the lapse threshold. Get it roughly right and
  the retention engine works; leave it wrong and it nags people at the wrong time.
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
| `lapse.lapseMultiplier` | 2× cadence. Lower for med spa, higher for nails |
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

## 7. Deploy — 20 minutes

```bash
npx vercel
```

Add every variable from `.env.local` in the Vercel dashboard, plus:

```env
NEXT_PUBLIC_APP_URL=https://yourdomain.com
CRON_SECRET=<random string>
```

`CRON_SECRET` is required. The cron routes refuse to run without it rather than
running unauthenticated — otherwise anyone who guesses the URL can fire the
entire messaging pipeline.

Cron schedules come from `vercel.json` automatically:

| Job | Schedule | What it does |
|---|---|---|
| `reminders` | hourly | Appointment reminders at each configured lead time |
| `rebooking-nudges` | daily 15:00 UTC | Nudges clients past their personal interval, with a real suggested slot |
| `winback` | weekly | Escalating offers to lapsed clients |
| `membership-health` | daily | Resumes pauses, warns on expiring credits, pitches memberships |
| `waitlist-fill` | every 15 min | Offers freed slots to the waitlist |
| `review-requests` | daily | Review asks and first-visit follow-ups |
| `refresh-metrics` | nightly | Recomputes client metrics and lifecycle |

Verify one after deploy:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/refresh-metrics
```

---

## 8. Go-live checklist

**Content**
- [ ] Real services, durations, and prices
- [ ] Real staff with bios, photos, and schedules
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

**Queries return nothing but the data exists** — RLS. Anonymous users only see
the public catalog. Server-side reads that need to bypass it must use
`createAdminClient()`, never the browser or SSR client.

**No available slots** — check in order: staff assigned to the service
(`service_staff`), schedules exist for that weekday, `effective_from` is in the
past, location `hours` cover the day, and the date is inside
`maxAdvanceBookingDays`.

**Stripe webhook 400s** — `STRIPE_WEBHOOK_SECRET` mismatch. The local
`stripe listen` secret and the production endpoint secret are different values.

**Messages aren't arriving** — check `campaign_sends`. A row with
`status = 'skipped'` carries a `skip_reason` explaining exactly why. A row with
`status = 'sent'` and no delivery means the provider is the problem, not the app.

**Double-booking** — should be impossible; the database enforces it with
exclusion constraints. If you see one, check whether something is writing to
`appointment_busy_blocks` directly instead of letting the trigger maintain it.
