import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/demo';

/**
 * ============================================================================
 * ADMIN AUTHORIZATION
 * ============================================================================
 * Every server action in the admin area calls `requireStaff` before it touches
 * anything. The middleware gates navigation, but a server action is a POST
 * endpoint that anyone can call directly — middleware is not authorization.
 * ============================================================================
 */

export interface StaffContext {
  staffId: string;
  businessId: string;
  role: 'owner' | 'manager' | 'front_desk' | 'provider' | 'read_only';
  userId: string;
  /** True in demo mode, where there is no database to protect. */
  demo: boolean;
}

export class NotAuthorizedError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'NotAuthorizedError';
  }
}

/**
 * Resolve the acting staff member, or throw.
 *
 * In demo mode there is no database and no real data, so actions run against
 * a synthetic context — which is what lets the whole admin be clicked through
 * before any infrastructure exists. Every write path checks `demo` and
 * short-circuits rather than pretending to save.
 */
export async function requireStaff(
  minimumRole: 'owner' | 'manager' | 'any' = 'any'
): Promise<StaffContext> {
  if (!isSupabaseConfigured()) {
    return {
      staffId: 'demo-staff',
      businessId: 'demo-business',
      role: 'owner',
      userId: 'demo-user',
      demo: true,
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new NotAuthorizedError('You are not signed in.');

  // Read through the service-role client: a provider's own RLS view of the
  // staff table is narrower than what this check needs.
  const admin = createAdminClient();
  const { data: staff } = await admin
    .from('staff')
    .select('id, business_id, role, active')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (!staff) throw new NotAuthorizedError('Staff access required.');

  const rank = { owner: 3, manager: 2, front_desk: 1, provider: 1, read_only: 0 };
  const needed = minimumRole === 'owner' ? 3 : minimumRole === 'manager' ? 2 : 1;

  if (rank[staff.role] < needed) {
    throw new NotAuthorizedError(
      minimumRole === 'owner'
        ? 'Only the account owner can do that.'
        : 'Only managers can do that.'
    );
  }

  return {
    staffId: staff.id,
    businessId: staff.business_id,
    role: staff.role,
    userId: user.id,
    demo: false,
  };
}

/** Uniform shape for every server action, so forms can render errors the same way. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };

export function actionError(err: unknown): ActionResult<never> {
  if (err instanceof NotAuthorizedError) return { ok: false, error: err.message };
  console.error('[action]', err);
  return {
    ok: false,
    error: err instanceof Error ? err.message : 'Something went wrong.',
  };
}
