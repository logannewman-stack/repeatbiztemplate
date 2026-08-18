import Link from 'next/link';
import { loadBrand } from '@/lib/brand';
import { vertical } from '@/config/verticals';
import { ToastProvider } from '@/components/ui/client';
import { AdminNav } from '@/components/admin/AdminNav';

export const metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false },
};

// Admin figures must never be served from a cache — a stale rebooking queue
// sends the front desk to call someone who already booked.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { brand } = await loadBrand();

  const nav = [
    { href: '/admin', label: 'Dashboard', icon: 'grid' },
    { href: '/admin/calendar', label: 'Calendar', icon: 'calendar' },
    { href: '/admin/checkout', label: 'Checkout', icon: 'card' },
    { href: '/admin/retention', label: 'Retention', icon: 'repeat' },
    { href: '/admin/clients', label: capitalize(vertical.clientNounPlural), icon: 'users' },
    { href: '/admin/services', label: 'Services', icon: 'tag' },
    { href: '/admin/staff', label: 'Team', icon: 'badge' },
    { href: '/admin/memberships', label: 'Memberships', icon: 'star' },
    { href: '/admin/campaigns', label: 'Campaigns', icon: 'mail' },
    { href: '/admin/reports', label: 'Reports', icon: 'chart' },
    { href: '/admin/setup', label: 'Setup', icon: 'sliders' },
  ];

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[var(--color-bg)]">
        <AdminNav
          items={nav}
          businessName={brand.shortName || brand.name}
          logoMark={brand.assets.logoMark}
        />

        <main id="main" className="lg:pl-60">
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
