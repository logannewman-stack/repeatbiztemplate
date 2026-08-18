#!/usr/bin/env node
/**
 * ============================================================================
 * DEPLOY PREFLIGHT
 * ============================================================================
 * Run before deploying, or from CI:
 *
 *     npm run preflight
 *
 * Reports what is configured, what will silently no-op, and what would fail a
 * Vercel deployment outright. Exits non-zero only on genuine blockers, so it
 * can gate a pipeline without failing every build that has not wired up SMS
 * yet.
 * ============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const problems = [];
const warnings = [];
const ok = [];

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// Load .env.local so a local run sees the same values `next dev` would.
const envFiles = ['.env.local', '.env.production.local', '.env'];
const env = { ...process.env };
for (const file of envFiles) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (env[match[1]] === undefined) env[match[1]] = value;
  }
}

const isSet = (key) => {
  const value = env[key];
  return Boolean(value && !value.includes('REPLACE_ME'));
};

// --- Vercel deployment blockers ---------------------------------------------

if (existsSync(join(root, 'vercel.json'))) {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const crons = vercel.crons ?? [];

  const subDaily = crons.filter((job) => !/^\d+ \d+ \* \* \*$/.test(job.schedule));

  if (crons.length > 2) {
    warnings.push(
      `vercel.json declares ${crons.length} cron jobs. Vercel's Hobby plan allows 2 — ` +
      `this deployment will be rejected unless the account is on Pro.`
    );
  } else if (subDaily.length > 0 && crons.length <= 2) {
    warnings.push(
      `${subDaily.length} cron schedule(s) run more than once a day ` +
      `(${subDaily.map((j) => j.schedule).join(', ')}). Hobby only permits daily ` +
      `schedules; this requires Pro.`
    );
  } else {
    ok.push(`vercel.json: ${crons.length} cron job(s), Hobby-compatible`);
  }
} else {
  warnings.push('No vercel.json — the scheduled automations will never run.');
}

if (!existsSync(join(root, 'package-lock.json'))) {
  problems.push(
    'No package-lock.json. Vercel installs from the lockfile; without one the ' +
    'build is not reproducible and can fail on a transitive version bump.'
  );
} else {
  ok.push('package-lock.json present');
}

// --- Core services ----------------------------------------------------------

if (isSet('NEXT_PUBLIC_SUPABASE_URL') && isSet('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
  ok.push('Supabase URL and anon key set');

  if (!isSet('SUPABASE_SERVICE_ROLE_KEY')) {
    problems.push(
      'SUPABASE_SERVICE_ROLE_KEY is missing while the Supabase URL is set. ' +
      'Booking, admin, and every cron job need it — the app will fall back to ' +
      'the demo catalog and no writes will succeed.'
    );
  } else {
    ok.push('Supabase service role key set');
  }
} else {
  warnings.push(
    'Supabase is not configured. The app will deploy and run in demo mode: ' +
    'the catalog comes from src/config/verticals.ts and nothing persists.'
  );
}

if (!isSet('NEXT_PUBLIC_APP_URL')) {
  warnings.push(
    'NEXT_PUBLIC_APP_URL is not set. Links inside emails and texts will be ' +
    'relative and will not work when a client taps them.'
  );
} else if (env.NEXT_PUBLIC_APP_URL.includes('localhost')) {
  warnings.push(
    `NEXT_PUBLIC_APP_URL is ${env.NEXT_PUBLIC_APP_URL}. Messages sent from ` +
    'production will link to localhost.'
  );
} else {
  ok.push(`App URL: ${env.NEXT_PUBLIC_APP_URL}`);
}

const supabaseReady =
  isSet('NEXT_PUBLIC_SUPABASE_URL') && isSet('SUPABASE_SERVICE_ROLE_KEY');

if (!isSet('CRON_SECRET')) {
  // Only a blocker once there is a database for the automations to act on.
  // A demo deployment has nothing for them to do either way.
  (supabaseReady ? problems : warnings).push(
    'CRON_SECRET is not set. The cron routes refuse to run without it rather ' +
    'than running unauthenticated, so every automation will 500.' +
    (supabaseReady ? '' : ' Not urgent while running in demo mode.')
  );
} else if (env.CRON_SECRET.length < 16) {
  warnings.push('CRON_SECRET is short. Use a long random string.');
} else {
  ok.push('CRON_SECRET set');
}

// --- Payments ---------------------------------------------------------------

if (isSet('STRIPE_SECRET_KEY')) {
  ok.push('Stripe secret key set');

  if (env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    warnings.push('Stripe is in TEST mode. Real cards will not be charged.');
  }
  if (!isSet('STRIPE_WEBHOOK_SECRET')) {
    problems.push(
      'STRIPE_WEBHOOK_SECRET is missing. The webhook is the only place a ' +
      'purchase is treated as complete, so memberships, packages, gift cards, ' +
      'and deposits will all be taken and never granted.'
    );
  } else {
    ok.push('Stripe webhook secret set');
  }
} else {
  warnings.push(
    'Stripe is not configured. Deposits, memberships, packages, and gift ' +
    'cards are disabled; booking still works.'
  );
}

// --- Messaging --------------------------------------------------------------

const emailReady = isSet('RESEND_API_KEY') && isSet('EMAIL_FROM');
const smsReady =
  isSet('TWILIO_ACCOUNT_SID') && isSet('TWILIO_AUTH_TOKEN') &&
  (isSet('TWILIO_MESSAGING_SERVICE_SID') || isSet('TWILIO_FROM_NUMBER'));

if (emailReady) ok.push('Email (Resend) configured');
else warnings.push('Email is not configured. Sends are logged, not delivered.');

if (smsReady) ok.push('SMS (Twilio) configured');
else warnings.push('SMS is not configured. Sends are logged, not delivered.');

if (emailReady || smsReady) {
  warnings.push(
    'Messaging is live. Confirm the message templates have been rewritten in ' +
    'the client\'s voice, and that A2P 10DLC is registered before sending ' +
    'marketing texts in the US.'
  );
}

// --- Report -----------------------------------------------------------------

console.log(`\n${c.bold('Deploy preflight')}\n`);

for (const line of ok) console.log(`  ${c.green('✓')} ${line}`);
if (warnings.length) {
  console.log(`\n  ${c.bold('Warnings')} ${c.dim('(deploys, but degraded)')}`);
  for (const line of warnings) console.log(`  ${c.yellow('!')} ${line}`);
}
if (problems.length) {
  console.log(`\n  ${c.bold('Blockers')}`);
  for (const line of problems) console.log(`  ${c.red('✗')} ${line}`);
}

console.log(
  `\n${ok.length} ok · ${warnings.length} warning(s) · ${problems.length} blocker(s)\n`
);

if (problems.length) {
  console.log(c.dim('See SETUP.md for how to resolve each of these.\n'));
  process.exit(1);
}
