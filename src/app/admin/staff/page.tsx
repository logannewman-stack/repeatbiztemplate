import { createAdminClient } from '@/lib/supabase/admin';
import { loadBrand } from '@/lib/brand';
import { isSupabaseConfigured, demoStaff } from '@/lib/demo';
import { vertical } from '@/config/verticals';
import { Alert } from '@/components/ui';
import { StaffManager } from '@/components/admin/StaffManager';

export const metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const { businessId } = await loadBrand();

  if (!isSupabaseConfigured() || !businessId) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Your {vertical.providerNounPlural} and their weekly schedules.
          </p>
        </header>

        <Alert tone="warning" title="Demo mode">
          Connect Supabase to manage real {vertical.providerNounPlural} — see{' '}
          <code>SETUP.md</code>.
        </Alert>

        <StaffManager
          staff={demoStaff().map((s) => ({
            id: s.id,
            displayName: s.display_name,
            title: s.title,
            bio: s.bio,
            email: null,
            phone: null,
            role: 'provider',
            bookable: true,
            active: true,
            priceMultiplier: s.price_multiplier,
            color: s.color,
            avatarUrl: null,
            shifts: [],
            serviceCount: 5,
            upcomingCount: 0,
          }))}
          providerNoun={vertical.providerNoun}
          readOnly
        />
      </div>
    );
  }

  const supabase = createAdminClient();

  const [{ data: staff }, { data: schedules }, { data: serviceLinks }] =
    await Promise.all([
      supabase.from('staff').select('*')
        .eq('business_id', businessId).order('sort_order'),
      supabase.from('staff_schedules')
        .select('staff_id, weekday, start_time, end_time'),
      supabase.from('service_staff').select('staff_id'),
    ]);

  const serviceCounts = new Map<string, number>();
  for (const link of serviceLinks ?? []) {
    serviceCounts.set(link.staff_id, (serviceCounts.get(link.staff_id) ?? 0) + 1);
  }

  // Upcoming load per provider, so an owner can see who is actually booked.
  const upcoming = new Map<string, number>();
  const { data: appointments } = await supabase
    .from('appointments')
    .select('staff_id')
    .eq('business_id', businessId)
    .in('status', ['booked', 'confirmed', 'requested'])
    .gte('starts_at', new Date().toISOString());

  for (const row of appointments ?? []) {
    if (row.staff_id) {
      upcoming.set(row.staff_id, (upcoming.get(row.staff_id) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Your {vertical.providerNounPlural} and their weekly schedules.
        </p>
      </header>

      <StaffManager
        staff={(staff ?? []).map((s) => ({
          id: s.id,
          displayName: s.display_name,
          title: s.title,
          bio: s.bio,
          email: s.email,
          phone: s.phone,
          role: s.role,
          bookable: s.bookable,
          active: s.active,
          priceMultiplier: Number(s.price_multiplier),
          color: s.color,
          avatarUrl: s.avatar_url,
          shifts: (schedules ?? [])
            .filter((row) => row.staff_id === s.id)
            .map((row) => ({
              weekday: row.weekday,
              start: String(row.start_time).slice(0, 5),
              end: String(row.end_time).slice(0, 5),
            }))
            .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)),
          serviceCount: serviceCounts.get(s.id) ?? 0,
          upcomingCount: upcoming.get(s.id) ?? 0,
        }))}
        providerNoun={vertical.providerNoun}
      />
    </div>
  );
}
