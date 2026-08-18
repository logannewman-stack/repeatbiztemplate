/**
 * ============================================================================
 * ADMIN DATA ACCESS
 * ============================================================================
 * Everything the operator dashboard reads. Each function falls back to
 * plausible demo figures when Supabase is not configured, so the admin UI is
 * demonstrable to a prospective client before any infrastructure exists.
 * ============================================================================
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/demo';
import { loadBusiness } from '@/lib/booking/queries';

export interface DashboardKpis {
  mrrCents: number;
  mrrDeltaPct: number | null;
  activeMembers: number;
  pastDueMembers: number;
  atRiskMrrCents: number;

  rebookRate: number | null;
  rebookRateDeltaPct: number | null;
  completedVisits: number;

  noShowRate: number | null;
  cancellationRate: number | null;
  lostRevenueCents: number;
  recoveredFeeCents: number;

  avgTicketCents: number | null;
  avgTicketDeltaPct: number | null;
  addonAttachRate: number | null;
  retailAttachRate: number | null;
  revenueCents: number;

  clientsDue: number;
  clientsLapsed: number;
  clientsAtRisk: number;
}

const DEMO_KPIS: DashboardKpis = {
  mrrCents: 263900,
  mrrDeltaPct: 8,
  activeMembers: 19,
  pastDueMembers: 2,
  atRiskMrrCents: 19800,
  rebookRate: 38.6,
  rebookRateDeltaPct: 5,
  completedVisits: 57,
  noShowRate: 5.9,
  cancellationRate: 10.3,
  lostRevenueCents: 108500,
  recoveredFeeCents: 21500,
  avgTicketCents: 15061,
  avgTicketDeltaPct: 4,
  addonAttachRate: 29.8,
  retailAttachRate: 10.5,
  revenueCents: 858477,
  clientsDue: 9,
  clientsLapsed: 63,
  clientsAtRisk: 6,
};

export async function loadDashboardKpis(): Promise<{
  kpis: DashboardKpis;
  demo: boolean;
}> {
  if (!isSupabaseConfigured()) return { kpis: DEMO_KPIS, demo: true };

  const business = await loadBusiness();
  if (!business) return { kpis: DEMO_KPIS, demo: true };

  const supabase = createAdminClient();

  const [
    { data: mrr },
    { data: rebooking },
    { data: attendance },
    { data: ticket },
    { data: lifecycle },
  ] = await Promise.all([
    supabase.from('v_mrr').select('*').eq('business_id', business.id).maybeSingle(),
    supabase.from('v_rebooking_rate').select('*').eq('business_id', business.id).limit(2),
    supabase.from('v_attendance').select('*').eq('business_id', business.id).limit(2),
    supabase.from('v_average_ticket').select('*').eq('business_id', business.id).limit(2),
    supabase.from('client_metrics').select('lifecycle').eq('business_id', business.id),
  ]);

  const [thisMonthRebook, lastMonthRebook] = rebooking ?? [];
  const [thisMonthAttendance] = attendance ?? [];
  const [thisMonthTicket, lastMonthTicket] = ticket ?? [];

  const counts = (lifecycle ?? []).reduce<Record<string, number>>((acc, row) => {
    const key = row.lifecycle ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const pctChange = (now?: number | null, prev?: number | null) =>
    now != null && prev != null && prev !== 0
      ? Math.round(((now - prev) / prev) * 100)
      : null;

  return {
    demo: false,
    kpis: {
      mrrCents: Number(mrr?.mrr_cents ?? 0),
      // MRR trend needs a stored history table to be exact; the movement view
      // gives the member-count trend, which is the number owners act on.
      mrrDeltaPct: null,
      activeMembers: Number(mrr?.active_members ?? 0),
      pastDueMembers: Number(mrr?.past_due_members ?? 0),
      atRiskMrrCents: Number(mrr?.at_risk_mrr_cents ?? 0),

      rebookRate: thisMonthRebook?.rebook_rate ?? null,
      rebookRateDeltaPct: pctChange(
        thisMonthRebook?.rebook_rate, lastMonthRebook?.rebook_rate
      ),
      completedVisits: Number(thisMonthRebook?.completed_visits ?? 0),

      noShowRate: thisMonthAttendance?.no_show_rate ?? null,
      cancellationRate: thisMonthAttendance?.cancellation_rate ?? null,
      lostRevenueCents: Number(thisMonthAttendance?.lost_revenue_cents ?? 0),
      recoveredFeeCents: Number(thisMonthAttendance?.recovered_fee_cents ?? 0),

      avgTicketCents: thisMonthTicket?.avg_ticket_cents ?? null,
      avgTicketDeltaPct: pctChange(
        thisMonthTicket?.avg_ticket_cents, lastMonthTicket?.avg_ticket_cents
      ),
      addonAttachRate: thisMonthTicket?.addon_attach_rate ?? null,
      retailAttachRate: thisMonthTicket?.retail_attach_rate ?? null,
      revenueCents: Number(thisMonthTicket?.revenue_cents ?? 0),

      clientsDue: counts.due ?? 0,
      clientsLapsed: counts.lapsed ?? 0,
      clientsAtRisk: counts.at_risk ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Retention queue — the list a front desk should work every morning
// ---------------------------------------------------------------------------

export interface DueClient {
  clientId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  lifecycle: string;
  lastVisitAt: string | null;
  daysSinceVisit: number | null;
  daysOverdue: number | null;
  churnRisk: number;
  avgTicketCents: number;
  lifetimeValueCents: number;
  visitCount: number;
  /** Expected value of winning them back. Sorts the queue. */
  priorityScore: number;
  /** Whether an automation already reached out. */
  lastContactedAt: string | null;
}

function demoDueClients(): DueClient[] {
  const names = [
    ['Client', 'Number 099', 'lapsed', 80, 95, 23156],
    ['Client', 'Number 035', 'lapsed', 77, 85, 22046],
    ['Client', 'Number 063', 'lapsed', 77, 85, 20718],
    ['Client', 'Number 007', 'lapsed', 171, 80, 19500],
    ['Client', 'Number 107', 'at_risk', 22, 70, 19250],
    ['Client', 'Number 044', 'due', 3, 50, 17800],
    ['Client', 'Number 018', 'due', 1, 50, 16200],
    ['Client', 'Number 072', 'at_risk', 18, 65, 15900],
  ] as const;

  return names.map(([first, last, lifecycle, overdue, risk, score], i) => ({
    clientId: `demo-client-${i}`,
    firstName: first,
    lastName: last,
    email: `client${String(i).padStart(3, '0')}@example.test`,
    phone: '(555) 010-01' + String(i).padStart(2, '0'),
    lifecycle,
    lastVisitAt: new Date(Date.now() - (overdue + 30) * 86_400_000).toISOString(),
    daysSinceVisit: overdue + 30,
    daysOverdue: overdue,
    churnRisk: risk,
    avgTicketCents: Math.round(score / (risk / 100)),
    lifetimeValueCents: Math.round(score * 6),
    visitCount: 4 + (i % 6),
    priorityScore: score,
    lastContactedAt: i % 3 === 0
      ? new Date(Date.now() - 5 * 86_400_000).toISOString()
      : null,
  }));
}

export async function loadDueClients(limit = 50): Promise<{
  clients: DueClient[];
  demo: boolean;
}> {
  if (!isSupabaseConfigured()) return { clients: demoDueClients(), demo: true };

  const business = await loadBusiness();
  if (!business) return { clients: demoDueClients(), demo: true };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('v_clients_due')
    .select('*')
    .eq('business_id', business.id)
    .limit(limit);

  const clientIds = (data ?? []).map((r) => r.client_id).filter(Boolean) as string[];

  // Last automated contact, so staff don't double-chase someone the system
  // already messaged this morning.
  const lastContact = new Map<string, string>();
  if (clientIds.length) {
    const { data: sends } = await supabase
      .from('campaign_sends')
      .select('client_id, sent_at')
      .in('client_id', clientIds)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false });

    for (const send of sends ?? []) {
      if (send.client_id && !lastContact.has(send.client_id)) {
        lastContact.set(send.client_id, send.sent_at!);
      }
    }
  }

  return {
    demo: false,
    clients: (data ?? []).map((r) => ({
      clientId: r.client_id!,
      firstName: r.first_name ?? '',
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      lifecycle: r.lifecycle ?? 'due',
      lastVisitAt: r.last_visit_at,
      daysSinceVisit: r.days_since_visit,
      daysOverdue: r.days_overdue,
      churnRisk: r.churn_risk ?? 0,
      avgTicketCents: r.avg_ticket_cents ?? 0,
      lifetimeValueCents: Number(r.lifetime_value_cents ?? 0),
      visitCount: r.visit_count ?? 0,
      priorityScore: r.priority_score ?? 0,
      lastContactedAt: lastContact.get(r.client_id!) ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Reporting series
// ---------------------------------------------------------------------------

export interface MonthlySeries {
  month: string;
  revenueCents: number;
  avgTicketCents: number;
  completedVisits: number;
  rebookRate: number;
  noShowRate: number;
  newMembers: number;
  churnedMembers: number;
  activeMembers: number;
}

function demoSeries(): MonthlySeries[] {
  const out: MonthlySeries[] = [];
  for (let i = 8; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    // Deterministic gentle upward trend so the demo charts read sensibly.
    out.push({
      month: d.toISOString().slice(0, 7),
      revenueCents: 700_00 + (8 - i) * 95_00 + ((i * 37) % 40) * 100,
      avgTicketCents: 13500 + (8 - i) * 190,
      completedVisits: 55 + (8 - i) * 3 + (i % 4),
      rebookRate: 24 + (8 - i) * 1.8,
      noShowRate: 8.2 - (8 - i) * 0.35,
      newMembers: 2 + ((i * 5) % 4),
      churnedMembers: 1 + (i % 3),
      activeMembers: 8 + (8 - i) * 1.6,
    });
  }
  return out.map((m) => ({ ...m, activeMembers: Math.round(m.activeMembers) }));
}

export async function loadMonthlySeries(): Promise<{
  series: MonthlySeries[];
  demo: boolean;
}> {
  if (!isSupabaseConfigured()) return { series: demoSeries(), demo: true };

  const business = await loadBusiness();
  if (!business) return { series: demoSeries(), demo: true };

  const supabase = createAdminClient();
  const [
    { data: ticket },
    { data: rebooking },
    { data: attendance },
    { data: movement },
  ] = await Promise.all([
    supabase.from('v_average_ticket').select('*').eq('business_id', business.id).limit(12),
    supabase.from('v_rebooking_rate').select('*').eq('business_id', business.id).limit(12),
    supabase.from('v_attendance').select('*').eq('business_id', business.id).limit(12),
    supabase.from('v_membership_movement').select('*').eq('business_id', business.id).limit(12),
  ]);

  const months = new Set<string>();
  for (const row of [...(ticket ?? []), ...(rebooking ?? []), ...(attendance ?? [])]) {
    if (row.month) months.add(String(row.month).slice(0, 7));
  }

  const byMonth = <T extends { month?: string | null }>(rows: T[] | null, month: string) =>
    (rows ?? []).find((r) => String(r.month ?? '').slice(0, 7) === month);

  const series = [...months]
    .sort()
    .slice(-12)
    .map((month) => {
      const t = byMonth(ticket, month);
      const r = byMonth(rebooking, month);
      const a = byMonth(attendance, month);
      const m = byMonth(movement, month);
      return {
        month,
        revenueCents: Number(t?.revenue_cents ?? 0),
        avgTicketCents: t?.avg_ticket_cents ?? 0,
        completedVisits: Number(r?.completed_visits ?? 0),
        rebookRate: Number(r?.rebook_rate ?? 0),
        noShowRate: Number(a?.no_show_rate ?? 0),
        newMembers: Number(m?.new_members ?? 0),
        churnedMembers: Number(m?.churned_members ?? 0),
        activeMembers: Number(m?.active_members ?? 0),
      };
    });

  return { series, demo: false };
}

/** Today's schedule for the front desk. */
export async function loadTodaySchedule() {
  if (!isSupabaseConfigured()) return { appointments: [], demo: true };

  const business = await loadBusiness();
  if (!business) return { appointments: [], demo: true };

  const supabase = createAdminClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data } = await supabase
    .from('appointments')
    .select(`
      id, starts_at, ends_at, status, price_cents, duration_min,
      clients(id, first_name, last_name, phone),
      services(name, rebook_interval_days),
      staff(display_name, color)
    `)
    .eq('business_id', business.id)
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
    .order('starts_at');

  return { appointments: data ?? [], demo: false };
}
