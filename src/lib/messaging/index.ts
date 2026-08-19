/**
 * ============================================================================
 * MESSAGING ADAPTERS
 * ============================================================================
 * Email and SMS are pluggable and default to a no-op that logs instead of
 * sending. That matters for a template: a fresh fork runs end to end — the
 * campaign engine fires, sends are recorded, dashboards populate — with no
 * provider account and no risk of texting a real phone number by accident.
 *
 * Filling in RESEND_API_KEY or the Twilio variables switches the real adapter
 * on. Nothing else changes.
 * ============================================================================
 */

import type { MessageChannel } from '@/types/database';
import { sendPushToClient } from './push';

export interface SendRequest {
  channel: MessageChannel;
  to: string;
  subject?: string;
  body: string;
  /** Idempotency key, mirrored from campaign_sends.dedupe_key. */
  idempotencyKey?: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId: string | null;
  error: string | null;
  /** True when no provider is configured and the send was logged instead. */
  simulated: boolean;
}

// --- Email ------------------------------------------------------------------

async function sendEmail(req: SendRequest): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info(
      `[messaging] EMAIL (simulated) to=${req.to} subject=${req.subject ?? ''}\n${req.body}`
    );
    return { ok: true, providerMessageId: null, error: null, simulated: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(req.idempotencyKey ? { 'Idempotency-Key': req.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [req.to],
        subject: req.subject ?? '',
        text: req.body,
      }),
    });

    if (!res.ok) {
      return {
        ok: false, providerMessageId: null,
        error: `Resend ${res.status}: ${await res.text()}`, simulated: false,
      };
    }

    const json = (await res.json()) as { id?: string };
    return { ok: true, providerMessageId: json.id ?? null, error: null, simulated: false };
  } catch (err) {
    return {
      ok: false, providerMessageId: null,
      error: err instanceof Error ? err.message : String(err), simulated: false,
    };
  }
}

// --- SMS --------------------------------------------------------------------

async function sendSms(req: SendRequest): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const messagingService = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || (!messagingService && !fromNumber)) {
    console.info(`[messaging] SMS (simulated) to=${req.to}\n${req.body}`);
    return { ok: true, providerMessageId: null, error: null, simulated: true };
  }

  try {
    const params = new URLSearchParams({ To: req.to, Body: req.body });
    if (messagingService) params.set('MessagingServiceSid', messagingService);
    else params.set('From', fromNumber!);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      }
    );

    if (!res.ok) {
      return {
        ok: false, providerMessageId: null,
        error: `Twilio ${res.status}: ${await res.text()}`, simulated: false,
      };
    }

    const json = (await res.json()) as { sid?: string };
    return { ok: true, providerMessageId: json.sid ?? null, error: null, simulated: false };
  } catch (err) {
    return {
      ok: false, providerMessageId: null,
      error: err instanceof Error ? err.message : String(err), simulated: false,
    };
  }
}


// --- Push -------------------------------------------------------------------

/**
 * For push, `to` is the client id rather than an address: a person may have
 * several devices subscribed, and the endpoints belong to the browser, not to
 * anything the campaign engine knows about.
 *
 * A client with no subscription returns ok:false with `no_subscription`, which
 * is how the caller knows to fall back to SMS. On iPhone that is the majority
 * case until someone installs the app, so it is a routine outcome, not a
 * failure worth alerting on.
 */
async function sendPush(req: SendRequest): Promise<SendResult> {
  const result = await sendPushToClient(req.to, {
    title: req.subject || 'Update',
    body: req.body,
    tag: req.idempotencyKey,
  });

  return {
    ok: result.ok,
    providerMessageId: null,
    error: result.error,
    simulated: result.simulated,
  };
}

export async function send(req: SendRequest): Promise<SendResult> {
  switch (req.channel) {
    case 'email': return sendEmail(req);
    case 'sms': return sendSms(req);
    case 'push': return sendPush(req);
    default:
      // in_app is recorded and read from the account screen; nothing outbound.
      console.info(`[messaging] ${req.channel.toUpperCase()} (no adapter) to=${req.to}`);
      return { ok: true, providerMessageId: null, error: null, simulated: true };
  }
}

export function messagingStatus(): {
  email: 'configured' | 'simulated';
  sms: 'configured' | 'simulated';
  push: 'configured' | 'simulated';
} {
  return {
    push:
      process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        ? 'configured'
        : 'simulated',
    email:
      process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? 'configured' : 'simulated',
    sms:
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)
        ? 'configured'
        : 'simulated',
  };
}
