/**
 * ============================================================================
 * NOTIFICATION BUDGET
 * ============================================================================
 * One rule, enforced in one place: a client gets at most so many promotional
 * messages a week, across every channel combined.
 *
 * The number comes from measured churn. Users receiving more than six
 * notifications a week from a single sender were about 3.4× more likely to
 * uninstall within thirty days than those receiving one or two. Push is worth
 * more than any single campaign that would spend it — transactional
 * notifications open at roughly 69%, and that only holds while the channel
 * stays trusted.
 *
 * Why one budget rather than one per channel: from the client's side, a text,
 * an email and a push are all "they contacted me again". Seven automations
 * that each behave reasonably on their own is exactly how someone ends up
 * with nine messages in a week.
 *
 * Transactional messages — a reminder for a booking they made, a receipt, a
 * card that failed — are exempt. They are the reason the person allowed
 * notifications at all.
 * ============================================================================
 */

import { createAdminClient } from '@/lib/supabase/admin';

/** Promotional messages per client per rolling week, all channels combined. */
export const WEEKLY_PROMOTIONAL_CAP = 4;

/** Local hours during which only transactional messages may go out. */
export const QUIET_HOURS = { startHour: 21, endHour: 8 };

export interface BudgetVerdict {
  allowed: boolean;
  /** Machine-readable, and written to campaign_sends.skip_reason verbatim. */
  reason: string | null;
  /** How many promotional sends the client has already had this week. */
  spent: number;
}

/**
 * The local hour in a named timezone, without pulling in a date library.
 * Intl already ships the full tz database in Node and every browser.
 */
export function localHour(timezone: string, at: Date = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(at);
    return Number(hour) % 24;
  } catch {
    // An invalid timezone should not silence every message. Fall back to UTC
    // and let the send happen rather than dropping it.
    return at.getUTCHours();
  }
}

export function isQuietHour(timezone: string, at: Date = new Date()): boolean {
  const hour = localHour(timezone, at);
  const { startHour, endHour } = QUIET_HOURS;

  // The window wraps midnight, so the comparison has to as well.
  return startHour > endHour
    ? hour >= startHour || hour < endHour
    : hour >= startHour && hour < endHour;
}

export interface BudgetRequest {
  clientId: string;
  /** Exempt from both the weekly cap and quiet hours. */
  transactional: boolean;
  /** The business's timezone — never the server's. */
  timezone: string;
  cap?: number;
  at?: Date;
}

export async function checkBudget(req: BudgetRequest): Promise<BudgetVerdict> {
  const cap = req.cap ?? WEEKLY_PROMOTIONAL_CAP;
  const at = req.at ?? new Date();

  if (req.transactional) {
    return { allowed: true, reason: null, spent: 0 };
  }

  if (isQuietHour(req.timezone, at)) {
    // Deferred rather than dropped: the campaign runs again on the next tick
    // and will pass once the window closes.
    return { allowed: false, reason: 'quiet_hours', spent: 0 };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('promotional_sends_this_week', {
    p_client_id: req.clientId,
  });

  if (error) {
    // Failing open would let a database blip turn into a message flood, which
    // is the exact outcome this exists to prevent.
    return { allowed: false, reason: `budget_unavailable:${error.message}`, spent: 0 };
  }

  const spent = typeof data === 'number' ? data : 0;

  return spent >= cap
    ? { allowed: false, reason: `weekly_cap:${spent}/${cap}`, spent }
    : { allowed: true, reason: null, spent };
}
