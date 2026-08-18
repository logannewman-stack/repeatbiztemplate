import { createAdminClient } from '@/lib/supabase/admin';
import { loadBusiness } from '@/lib/booking/queries';
import { resolveRules } from '@/lib/rules';
import { dispatch } from '@/lib/retention/dispatch';
import { selectWinbackOffer } from '@/lib/retention/rebooking';
import { summarize, type CronSummary } from '@/lib/cron';
import { generateCode } from '@/lib/utils';

/**
 * Winback. Runs weekly.
 *
 * Issues a real, single-use offer code rather than a generic discount link, so
 * the redemption can be attributed and the campaign's actual margin cost is
 * measurable. Offers escalate with time; past `giveUpAfterDays` we stop, because
 * chasing costs more than it returns.
 */
export async function run(): Promise<CronSummary> {
  const startedAt = Date.now();
  const business = await loadBusiness();
  if (!business) throw new Error('Business not configured.');

  const rules = resolveRules(business.policy);
  const supabase = createAdminClient();
  const results: Array<{ status: string }> = [];
  let offersIssued = 0;

  const { data: lapsed } = await supabase
    .from('v_clients_due')
    .select('*')
    .eq('business_id', business.id)
    .eq('lifecycle', 'lapsed')
    .order('priority_score', { ascending: false })
    .limit(300);

  for (const client of lapsed ?? []) {
    if (!client.client_id || client.days_since_visit == null) continue;

    const daysLapsed = client.days_overdue ?? 0;
    const offer = selectWinbackOffer(daysLapsed, rules);
    if (!offer) continue;

    const campaignKey = daysLapsed >= 90 ? 'winback_90' : 'winback_30';

    // Issue a single-use code so redemption is attributable.
    const code = generateCode('BACK', 6);
    const { error: offerError } = await supabase.from('offers').insert({
      business_id: business.id,
      client_id: client.client_id,
      code,
      label: offer.label,
      kind: offer.kind,
      value: offer.value,
      source: 'winback',
      max_redemptions: 1,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });

    if (!offerError) offersIssued++;

    const result = await dispatch({
      businessId: business.id,
      campaignKey,
      clientId: client.client_id,
      occurrence: `${campaignKey}:${new Date().toISOString().slice(0, 10)}`,
      varsOverride: {
        offer: { label: offer.label, code },
      } as never,
    });
    results.push(result);
  }

  return summarize('winback', startedAt, results, { offersIssued });
}
