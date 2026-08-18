# Repeat Biz Template

A white-label booking and retention platform for local businesses that live on
repeat custom — hair and nail salons, med spas, massage studios, barbershops,
lash and brow studios, waxing, tanning, pet grooming, chiropractic, physical
therapy, dental hygiene, personal training, auto detailing.

Fork it, edit three config files, connect Supabase / Stripe / Vercel, and you
have a working product for one client. Nothing in here is branded. Every name,
price, and photo is a placeholder — the demo business is "123 Example Studio".

---

## What it is actually for

Most booking software sells calendars. Calendars are table stakes. This
template is built around the three numbers that decide whether a local
appointment business grows or grinds:

**1. Monthly recurring revenue.** Memberships turn a seasonal, attention-
dependent revenue stream into a predictable one — and a client who has already
paid shows up more reliably. Ships with plans, included visit credits with
rollover, prepaid packages, gift cards, dunning, and a cancellation save flow
that leads with pause rather than goodbye.

**2. Cancellations and no-shows.** Every cancelled slot is pure loss: the rent,
the staff, and the hour are already spent. Ships with risk-scored deposits, a
tiered cancellation policy, reschedule-first flows, confirmation asks, and a
waitlist that refills a freed slot automatically.

**3. Average ticket.** Ships with add-on prompts positioned where they convert,
retail attach, tips, package upsells, and per-provider pricing.

Underneath all three sits the mechanic that matters most:

**Rebooking.** A client who leaves with their next visit on the calendar is
worth several times one who doesn't. The template tracks each client's *own*
visit cadence, prompts for the next booking at checkout, and chases the ones
who slip — with one specific suggested time, not a link to an empty calendar.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript | One deployable, server components for the data-heavy admin |
| Styling | Tailwind CSS v4 | CSS-variable theming, so brand changes need no rebuild of tokens |
| Database | Supabase (Postgres + Auth + Storage + RLS) | Row-level security means the client portal is safe by construction |
| Payments | Stripe (Checkout, Billing, webhooks) | Subscriptions, deposits, stored-card fee collection |
| Hosting | Vercel (+ Vercel Cron) | The seven automation jobs are just scheduled routes |
| Messaging | Resend + Twilio, pluggable | Both default to a logging no-op so a fresh fork can't text anyone |

---

## Run it right now

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. **No database, no Stripe account, no `.env` file
needed.** Demo mode serves the catalog from `src/config/verticals.ts`, so the
whole booking flow and the admin dashboard are clickable immediately.

Change `vertical` in `src/config/brand.ts` to `hair_salon`, `med_spa`,
`massage`, or any of the other 14 presets, reload, and the entire app re-skins:
vocabulary, services, add-ons, membership shapes, and rebooking cadences.

That is the demo you show a prospective client before you have built them
anything.

---

## Standing up a real client

Full walkthrough in **[SETUP.md](./SETUP.md)**. The short version:

1. **Supabase** — create a project, run the migrations, seed.
2. **Deploy** to Vercel with the Supabase keys.
3. **Open `/admin/setup`** and fill in the wizard — everything below is done in
   the browser, and takes effect immediately with no redeploy:
   - business name, type, contact details, timezone, tax rate
   - logo, app icon, hero photo, and one brand color (the rest of the palette
     is derived from it, with a live preview of the real booking card)
   - the service menu — import the vertical's starter catalog in one click,
     then edit prices and durations
   - providers, their price levels, and weekly schedules
   - opening hours
4. **Stripe** — add keys and create the webhook endpoint.
5. **Messaging** — add Resend and Twilio credentials.

Nothing above requires editing a file. `src/config/*` still holds the compiled
defaults — useful when you want a fork to start life already branded — but the
database wins over them at runtime, so a client can rename themselves at 9pm on
a Friday without waiting for you.

Realistically about half a day for the first one, and an hour or two once
you've done a few.

---

## The three fork points

Everything client-specific lives in three files — or, at runtime, in the
database rows the setup wizard writes. If you find yourself editing anything
else to launch a client, that is a bug in the template.

### `src/config/brand.ts`
Name, tagline, colors (OKLCH), fonts, contact details, asset paths, and the
copy for the money moments. Colors are emitted as CSS custom properties, so
one edit re-themes the client portal, the admin, and the emails.

### `src/config/verticals.ts`
Sixteen presets. Each carries the vocabulary (client vs. patient, stylist vs.
injector, appointment vs. session), the default service catalog with realistic
durations and prices, add-ons, membership shapes that actually sell in that
vertical, and — most importantly — the **rebooking interval** for each service.

### `src/config/rules.ts`
Every revenue and retention lever, documented inline: cancellation fee tiers,
deposit triggers, reminder cadence, rebooking nudge schedule, lapse detection,
membership save offers, dunning, upsell limits, loyalty, referrals, review
gating. Anything here can also be overridden per-business at runtime through
the `businesses.policy` JSONB column, so an owner can change their cancellation
window without waiting for a deploy.

---

## What's in the box

**Client-facing**
- Mobile-first booking flow with guest checkout, add-on upsell, deposit
  explanation, and a live membership savings pitch
- Client portal: upcoming visits, history, one-tap rebook, membership and
  credits, offers
- Magic-link auth (no passwords — a client who books every six weeks will not
  remember one)
- Policies page generated from `rules.ts`, so it cannot contradict the software
- Installable PWA

**Operator-facing**
- Guided setup wizard — logo upload, brand color with live preview, one-click
  service catalog import, provider and schedule entry, opening hours
- Dashboard leading with MRR, rebooking rate, attendance, and average ticket
- Day and week calendar with provider columns, overlap lanes, processing-gap
  shading, a live "now" line, and click-through appointment actions
- Checkout terminal: add-ons and retail, tips, membership credits, deposit
  applied, and a rebooking step with a real suggested slot
- Retention queue ranked by expected recovered value, not by how late someone is
- Service and add-on management with attach-rate reporting
- Team management with split-shift weekly schedules
- Client CRM with lifecycle segmentation, formula and clinical notes, files
- Membership management with save-flow and dunning visibility
- Campaign performance with attributed revenue per automation
- Twelve-month reporting

**Engine**
- Availability engine handling shifts, time off, buffers, rooms, and
  processing-gap overlap (a short service books *inside* a long service's
  develop-and-wait window)
- Database-level double-booking prevention via GiST exclusion constraints
- Per-client cadence tracking, no-show risk, churn risk
- Campaign engine with real guardrails: never chase someone who already
  rebooked, a cross-campaign frequency cap, quiet hours that defer rather than
  drop, and a logged reason for every skip
- Seven cron jobs running the whole retention machine unattended

---

## Testing

```bash
npm test          # 136 unit tests
npm run typecheck
npm run build
```

The availability engine, pricing, deposits, cancellation policy, rebooking
cadence, campaign eligibility, calendar overlap layout, and the hex/OKLCH
color conversion are all covered. The schema, seed, and demo
data generator were applied against a real PostgreSQL 16 instance, and the
exclusion constraints were verified with SQL tests covering double-booking,
processing-gap fill, and slot release on cancellation.

---

## Repository map

```
src/
  config/          The three fork points — brand, verticals, rules
  lib/
    booking/       Availability engine, pricing, deposits, cancellation policy
    brand.ts       Runtime brand resolution and hex/OKLCH conversion
    retention/     Rebooking cadence, campaign eligibility, dispatch
    stripe/        Checkout, subscriptions, save flow
    messaging/     Template rendering, email + SMS adapters
    supabase/      Browser, server, and service-role clients
    admin/         Dashboard, calendar, reporting queries, and authorization
  app/
    (public)       Landing, booking, memberships, policies, gift cards
    account/       Client portal
    admin/         Operator dashboard
    api/           Booking, availability, Stripe webhook, cron jobs
supabase/
  migrations/      Eleven migrations — schema, functions, views, RLS, storage
  seed.sql         123 Example Studio
  demo-history.sql Nine months of synthetic history for demos
```

---

## Before you launch anything

Placeholders that must be replaced — the Settings page in the admin lists these
too:

- Brand, logo, icons, and hero image
- **Legal pages.** The policies page, consent forms, and privacy notice ship as
  placeholders. Have them reviewed by the client's own counsel, especially for
  med spa, chiropractic, dental, or any build touching health information.
- The public review URL in `rules.reviews.publicReviewUrl`
- Message template copy — the seeded text is deliberately plain
- **SMS compliance.** Register a Twilio A2P 10DLC campaign before sending
  marketing texts in the US, and keep opt-out language in every marketing
  template.
- Remove the demo clients if `demo-history.sql` was ever run against the project

## License

Unlicensed template for your own client work. Add whatever license you want
before distributing it.
