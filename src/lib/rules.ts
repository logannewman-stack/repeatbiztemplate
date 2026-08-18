import { rules as defaultRules, type AllRules } from '@/config/rules';
import { deepMerge } from '@/lib/utils';
import type { Json } from '@/types/database';

/**
 * Resolve the effective rule set for a business.
 *
 * `src/config/rules.ts` holds the defaults that ship with the fork. The
 * `businesses.policy` JSONB column holds per-business overrides edited from
 * Settings → Policies. This merges the two so an owner can shorten their
 * cancellation window at 9pm on a Friday without waiting on a deploy.
 */
export function resolveRules(policy: Json | null | undefined): AllRules {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return defaultRules;
  }
  return deepMerge(defaultRules, policy);
}

export type { AllRules };
export { defaultRules };
