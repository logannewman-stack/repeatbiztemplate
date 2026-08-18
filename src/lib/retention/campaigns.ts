/**
 * ============================================================================
 * CAMPAIGN ENGINE
 * ============================================================================
 * Decides who gets messaged, through which channel, and — just as importantly
 * — who does not.
 *
 * Guardrails are the whole game here. An automation that chases a client who
 * already rebooked, or texts them at 11pm, or hits them four times in a week,
 * does more damage than the marginal booking is worth. Every skip is recorded
 * with a reason so an owner asking "why didn't my client get this?" gets a
 * real answer instead of a shrug.
 * ============================================================================
 */

import type { AllRules } from '@/config/rules';
import type { Campaign, Client, ClientMetrics, MessageChannel } from '@/types/database';

export interface EligibilityInput {
  campaign: Pick<
    Campaign,
    | 'id' | 'key' | 'channel' | 'fallback_channel' | 'cooldown_days'
    | 'skip_if_future_booking' | 'skip_if_lapsed_beyond_days'
    | 'min_churn_risk' | 'respect_quiet_hours' | 'active'
  >;
  client: Pick<
    Client,
    | 'id' | 'email' | 'phone' | 'sms_opt_in' | 'email_opt_in'
    | 'marketing_opt_in' | 'opted_out_at' | 'archived_at'
  >;
  metrics: Pick<
    ClientMetrics,
    'has_future_booking' | 'churn_risk' | 'last_visit_at' | 'lifecycle'
  > | null;
  /** Most recent send from this campaign to this client. */
  lastSentAt: string | null;
  /** Any send to this client, from any campaign. */
  lastAnySentAt: string | null;
  /** Local time at the client's location. */
  localNow: Date;
  rules: AllRules;
  /**
   * Transactional messages (confirmations, reminders, dunning) bypass
   * marketing opt-in and quiet hours. Marketing messages never do.
   */
  isTransactional: boolean;
}

export type SkipReason =
  | 'campaign_inactive'
  | 'client_archived'
  | 'opted_out'
  | 'no_contact_method'
  | 'channel_not_opted_in'
  | 'has_future_booking'
  | 'cooldown'
  | 'global_frequency_cap'
  | 'below_risk_threshold'
  | 'lapsed_beyond_limit'
  | 'quiet_hours';

export interface EligibilityResult {
  eligible: boolean;
  channel: MessageChannel | null;
  toAddress: string | null;
  skipReason: SkipReason | null;
  /** When quiet hours block a send, when to retry instead of dropping it. */
  deferUntil: Date | null;
}

/** No client should hear from an automation more than this often. */
const GLOBAL_FREQUENCY_CAP_HOURS = 20;

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const { campaign, client, metrics, rules, localNow, isTransactional } = input;

  const skip = (skipReason: SkipReason): EligibilityResult => ({
    eligible: false, channel: null, toAddress: null, skipReason, deferUntil: null,
  });

  if (!campaign.active) return skip('campaign_inactive');
  if (client.archived_at) return skip('client_archived');

  // A hard opt-out stops everything except genuinely transactional mail.
  if (client.opted_out_at && !isTransactional) return skip('opted_out');

  // --- Channel resolution -------------------------------------------------
  // Try the campaign's preferred channel, then its fallback. A client who
  // hasn't consented to SMS but reads email should still get the message.
  const channels: MessageChannel[] = [campaign.channel];
  if (campaign.fallback_channel) channels.push(campaign.fallback_channel);

  let channel: MessageChannel | null = null;
  let toAddress: string | null = null;

  for (const candidate of channels) {
    if (candidate === 'sms') {
      if (!client.phone) continue;
      if (!client.sms_opt_in && !isTransactional) continue;
      channel = 'sms';
      toAddress = client.phone;
      break;
    }
    if (candidate === 'email') {
      if (!client.email) continue;
      if (!client.email_opt_in && !isTransactional) continue;
      channel = 'email';
      toAddress = client.email;
      break;
    }
    // push / in_app need no address.
    channel = candidate;
    toAddress = null;
    break;
  }

  if (!channel) {
    const hasAnyContact = !!client.email || !!client.phone;
    return skip(hasAnyContact ? 'channel_not_opted_in' : 'no_contact_method');
  }

  // Marketing needs explicit marketing consent on top of channel consent.
  if (!isTransactional && !client.marketing_opt_in) {
    return skip('opted_out');
  }

  // --- Targeting guardrails ------------------------------------------------

  // Never chase someone who already rebooked. This is the guardrail that
  // matters most for keeping good clients from feeling harassed.
  if (campaign.skip_if_future_booking && metrics?.has_future_booking) {
    return skip('has_future_booking');
  }

  if (campaign.min_churn_risk > 0 && (metrics?.churn_risk ?? 0) < campaign.min_churn_risk) {
    return skip('below_risk_threshold');
  }

  if (campaign.skip_if_lapsed_beyond_days && metrics?.last_visit_at) {
    const daysSince =
      (localNow.getTime() - new Date(metrics.last_visit_at).getTime()) / 86_400_000;
    if (daysSince > campaign.skip_if_lapsed_beyond_days) {
      return skip('lapsed_beyond_limit');
    }
  }

  // --- Frequency -----------------------------------------------------------

  if (campaign.cooldown_days > 0 && input.lastSentAt) {
    const daysSince =
      (localNow.getTime() - new Date(input.lastSentAt).getTime()) / 86_400_000;
    if (daysSince < campaign.cooldown_days) return skip('cooldown');
  }

  // Cross-campaign cap so three automations firing the same day don't stack.
  if (!isTransactional && input.lastAnySentAt) {
    const hoursSince =
      (localNow.getTime() - new Date(input.lastAnySentAt).getTime()) / 3_600_000;
    if (hoursSince < GLOBAL_FREQUENCY_CAP_HOURS) return skip('global_frequency_cap');
  }

  // --- Quiet hours ---------------------------------------------------------
  // Defer rather than drop: the message is still worth sending, just later.

  if (campaign.respect_quiet_hours && !isTransactional) {
    const deferUntil = quietHoursDeferral(localNow, rules.reminders.quietHours);
    if (deferUntil) {
      return { eligible: false, channel, toAddress, skipReason: 'quiet_hours', deferUntil };
    }
  }

  return { eligible: true, channel, toAddress, skipReason: null, deferUntil: null };
}

/**
 * If `localNow` falls inside quiet hours, return the next moment it doesn't.
 * Handles windows that wrap past midnight (21:00 → 08:00).
 */
export function quietHoursDeferral(
  localNow: Date,
  quiet: { start: string; end: string }
): Date | null {
  const [startH, startM] = quiet.start.split(':').map(Number);
  const [endH, endM] = quiet.end.split(':').map(Number);

  const minutesNow = localNow.getHours() * 60 + localNow.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  const wraps = startMinutes > endMinutes;
  const inQuiet = wraps
    ? minutesNow >= startMinutes || minutesNow < endMinutes
    : minutesNow >= startMinutes && minutesNow < endMinutes;

  if (!inQuiet) return null;

  const resume = new Date(localNow);
  resume.setHours(endH, endM, 0, 0);
  // Past the end time already means we're in the pre-midnight half of a
  // wrapping window, so the window ends tomorrow morning.
  if (resume <= localNow) resume.setDate(resume.getDate() + 1);
  return resume;
}

/**
 * Idempotency key for a send.
 *
 * Cron jobs re-run, webhooks redeliver, and a backfill can replay a whole
 * day. The unique index on `campaign_sends.dedupe_key` turns "send this once"
 * into a database guarantee rather than a hope. `occurrence` should identify
 * the specific trigger instance — an appointment id for a reminder, a date
 * bucket for a recurring nudge.
 */
export function dedupeKey(
  campaignKey: string,
  clientId: string,
  occurrence: string
): string {
  return `${campaignKey}:${clientId}:${occurrence}`;
}

/**
 * Attribution window: a booking made within this long after a send is
 * credited to it. Two days is long enough to catch someone who read the text
 * at work and booked that evening, short enough not to claim credit for a
 * booking the client would have made anyway.
 */
export const ATTRIBUTION_WINDOW_HOURS = 48;

export function isAttributable(sentAt: string, bookedAt: string): boolean {
  const gapHours =
    (new Date(bookedAt).getTime() - new Date(sentAt).getTime()) / 3_600_000;
  return gapHours >= 0 && gapHours <= ATTRIBUTION_WINDOW_HOURS;
}
