/**
 * ============================================================================
 * CAMPAIGN DISPATCH
 * ============================================================================
 * Ties together eligibility, template rendering, and delivery, and records
 * every outcome — including every skip, with its reason — into
 * `campaign_sends`.
 *
 * Recording skips is not bookkeeping for its own sake. "Why didn't my client
 * get the reminder?" is the most common question an owner asks about an
 * automation, and without a skip row the honest answer is a shrug.
 * ============================================================================
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { checkEligibility, dedupeKey } from './campaigns';
import { render, buildVars, type BuildVarsInput } from '@/lib/messaging/render';
import { send } from '@/lib/messaging';
import { resolveRules } from '@/lib/rules';
import type { CampaignTrigger } from '@/types/database';
import { resolveAppUrl } from '@/lib/url';

export interface DispatchRequest {
  businessId: string;
  campaignKey: string;
  clientId: string;
  /** Identifies this trigger instance, for idempotency. */
  occurrence: string;
  appointmentId?: string | null;
  membershipId?: string | null;
  /** Extra merge variables layered over the ones built from the database. */
  varsOverride?: Partial<BuildVarsInput>;
  /** Confirmations, reminders, receipts, and dunning bypass marketing consent. */
  transactional?: boolean;
  /** Send immediately even if outside the campaign's normal window. */
  force?: boolean;
}

export interface DispatchResult {
  status: 'sent' | 'skipped' | 'failed' | 'deferred' | 'duplicate';
  sendId: string | null;
  reason: string | null;
  simulated: boolean;
}

const TRANSACTIONAL_TRIGGERS: CampaignTrigger[] = [
  'appointment_booked',
  'appointment_reminder',
  'appointment_completed',
  'membership_dunning',
  'waitlist_offer',
];

export async function dispatch(req: DispatchRequest): Promise<DispatchResult> {
  const supabase = createAdminClient();
  const key = dedupeKey(req.campaignKey, req.clientId, req.occurrence);

  // --- Load everything in one pass ----------------------------------------

  const [
    { data: campaign },
    { data: client },
    { data: business },
  ] = await Promise.all([
    supabase
      .from('campaigns')
      .select('*')
      .eq('business_id', req.businessId)
      .eq('key', req.campaignKey)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('*, client_metrics(*)')
      .eq('id', req.clientId)
      .maybeSingle(),
    supabase
      .from('businesses')
      .select('*')
      .eq('id', req.businessId)
      .maybeSingle(),
  ]);

  if (!campaign) {
    return { status: 'skipped', sendId: null, reason: 'campaign_not_found', simulated: false };
  }
  if (!client || !business) {
    return { status: 'skipped', sendId: null, reason: 'client_not_found', simulated: false };
  }

  const rules = resolveRules(business.policy);
  const metrics = (client as unknown as {
    client_metrics: Array<Record<string, unknown>> | Record<string, unknown> | null;
  }).client_metrics;
  const metricsRow = Array.isArray(metrics) ? metrics[0] ?? null : metrics ?? null;

  const isTransactional =
    req.transactional ?? TRANSACTIONAL_TRIGGERS.includes(campaign.trigger_type);

  // --- Prior sends, for cooldown and frequency capping --------------------

  const [{ data: lastForCampaign }, { data: lastAny }] = await Promise.all([
    supabase
      .from('campaign_sends')
      .select('sent_at')
      .eq('client_id', req.clientId)
      .eq('campaign_id', campaign.id)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('campaign_sends')
      .select('sent_at')
      .eq('client_id', req.clientId)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Local time at the business, for quiet-hours evaluation.
  const localNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: business.timezone })
  );

  const eligibility = checkEligibility({
    campaign,
    client,
    metrics: metricsRow as never,
    lastSentAt: req.force ? null : lastForCampaign?.sent_at ?? null,
    lastAnySentAt: req.force ? null : lastAny?.sent_at ?? null,
    localNow,
    rules,
    isTransactional,
  });

  // --- Skipped or deferred: record and stop -------------------------------

  if (!eligibility.eligible && !req.force) {
    const deferred = eligibility.deferUntil != null;

    const { data: row } = await supabase
      .from('campaign_sends')
      .upsert(
        {
          business_id: req.businessId,
          campaign_id: campaign.id,
          client_id: req.clientId,
          appointment_id: req.appointmentId ?? null,
          membership_id: req.membershipId ?? null,
          channel: eligibility.channel ?? campaign.channel,
          status: deferred ? 'scheduled' : 'skipped',
          scheduled_for: (eligibility.deferUntil ?? new Date()).toISOString(),
          skip_reason: eligibility.skipReason,
          dedupe_key: key,
        },
        { onConflict: 'dedupe_key', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();

    return {
      status: deferred ? 'deferred' : 'skipped',
      sendId: row?.id ?? null,
      reason: eligibility.skipReason,
      simulated: false,
    };
  }

  // --- Template -----------------------------------------------------------

  const channel = eligibility.channel ?? campaign.channel;
  const toAddress = eligibility.toAddress;

  const { data: template } = await supabase
    .from('message_templates')
    .select('*')
    .eq('business_id', req.businessId)
    .eq('key', campaign.template_key)
    .eq('channel', channel)
    .eq('active', true)
    .maybeSingle();

  if (!template) {
    return {
      status: 'skipped', sendId: null,
      reason: `no_template:${campaign.template_key}:${channel}`, simulated: false,
    };
  }

  // --- Merge variables ----------------------------------------------------

  let appointment: BuildVarsInput['appointment'] = null;
  if (req.appointmentId) {
    const { data } = await supabase
      .from('appointments')
      .select('starts_at, duration_min, price_cents, services(name, rebook_interval_days), staff(display_name)')
      .eq('id', req.appointmentId)
      .maybeSingle();

    if (data) {
      const service = data.services as unknown as { name: string; rebook_interval_days: number } | null;
      const staffRow = data.staff as unknown as { display_name: string } | null;
      appointment = {
        starts_at: data.starts_at,
        service_name: service?.name ?? '',
        staff_name: staffRow?.display_name ?? null,
        duration_min: data.duration_min,
        price_cents: data.price_cents,
      };
    }
  }

  const appUrl = resolveAppUrl();
  const metricsTyped = metricsRow as {
    last_visit_at?: string | null; spend_90d_cents?: number; loyalty_points?: number;
  } | null;

  const baseVars: BuildVarsInput = {
    business: {
      name: business.name,
      timezone: business.timezone,
    },
    client: {
      first_name: client.first_name,
      last_name: client.last_name,
      days_since_visit: metricsTyped?.last_visit_at
        ? Math.round(
            (Date.now() - new Date(metricsTyped.last_visit_at).getTime()) / 86_400_000
          )
        : null,
      spend_90d_cents: metricsTyped?.spend_90d_cents ?? null,
      loyalty_points: metricsTyped?.loyalty_points ?? null,
    },
    appointment,
    service: appointment
      ? { name: appointment.service_name }
      : null,
    staff: appointment?.staff_name ? { name: appointment.staff_name } : null,
    links: {
      book: `${appUrl}/book`,
      rebook: `${appUrl}/book?rebook=${req.clientId}`,
      manage: req.appointmentId
        ? `${appUrl}/account/appointments/${req.appointmentId}`
        : `${appUrl}/account`,
      confirm: req.appointmentId
        ? `${appUrl}/a/${req.appointmentId}/confirm`
        : `${appUrl}/account`,
      claim: req.appointmentId ? `${appUrl}/a/${req.appointmentId}/claim` : `${appUrl}/book`,
      account: `${appUrl}/account`,
      billing: `${appUrl}/account/membership`,
      membership: `${appUrl}/memberships`,
      review: `${appUrl}/r/${req.appointmentId ?? ''}`,
    },
    currency: business.currency,
    locale: business.locale,
    ...req.varsOverride,
  };

  const vars = buildVars(baseVars);
  const body = render(template.body, vars);
  const subject = template.subject ? render(template.subject, vars) : null;

  // --- Insert the send row first ------------------------------------------
  // Claiming the dedupe key before the network call is what makes a retried
  // cron run safe: a duplicate insert fails here rather than after the
  // message has already gone out.

  const { data: sendRow, error: insertError } = await supabase
    .from('campaign_sends')
    .insert({
      business_id: req.businessId,
      campaign_id: campaign.id,
      client_id: req.clientId,
      appointment_id: req.appointmentId ?? null,
      membership_id: req.membershipId ?? null,
      channel,
      status: 'sending',
      to_address: toAddress,
      subject: subject?.text ?? null,
      body: body.text,
      scheduled_for: new Date().toISOString(),
      dedupe_key: key,
    })
    .select('id')
    .single();

  if (insertError) {
    // Unique violation on dedupe_key: already handled by another run.
    if (insertError.code === '23505') {
      return { status: 'duplicate', sendId: null, reason: 'already_sent', simulated: false };
    }
    return { status: 'failed', sendId: null, reason: insertError.message, simulated: false };
  }

  // --- Deliver ------------------------------------------------------------

  const result = await send({
    channel,
    to: toAddress ?? '',
    subject: subject?.text,
    body: body.text,
    idempotencyKey: key,
  });

  await supabase
    .from('campaign_sends')
    .update(
      result.ok
        ? { status: 'sent', sent_at: new Date().toISOString() }
        : { status: 'failed', failed_at: new Date().toISOString(), error: result.error }
    )
    .eq('id', sendRow.id);

  return {
    status: result.ok ? 'sent' : 'failed',
    sendId: sendRow.id,
    reason: result.error,
    simulated: result.simulated,
  };
}

/**
 * Credit a booking to the send that produced it.
 *
 * Called after any booking is created. Looks for a recent send to this client
 * and, if one falls inside the attribution window, records the booking and its
 * value against it — which is what makes `v_campaign_performance` meaningful
 * rather than a vanity open-rate chart.
 */
export async function attributeBooking(opts: {
  clientId: string;
  appointmentId: string;
  valueCents: number;
}): Promise<string | null> {
  const supabase = createAdminClient();

  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();

  const { data: recentSend } = await supabase
    .from('campaign_sends')
    .select('id')
    .eq('client_id', opts.clientId)
    .in('status', ['sent', 'delivered'])
    .is('converted_at', null)
    .gte('sent_at', cutoff)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!recentSend) return null;

  await Promise.all([
    supabase
      .from('campaign_sends')
      .update({
        converted_at: new Date().toISOString(),
        converted_appointment_id: opts.appointmentId,
        conversion_value_cents: opts.valueCents,
      })
      .eq('id', recentSend.id),
    supabase
      .from('appointments')
      .update({ attributed_send_id: recentSend.id })
      .eq('id', opts.appointmentId),
  ]);

  return recentSend.id;
}
