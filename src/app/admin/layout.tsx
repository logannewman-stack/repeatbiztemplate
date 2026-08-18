import Link from 'next/link';
import { brand } from '@/config/brand';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '◲' },
  { href: '/admin/calendar', label: 'Calendar', icon: '▦' },
  { href: '/admin/retention', label: 'Retention', icon: '↻' },
  { href: '/admin/clients', label: 'Clients', icon: '☺' },
  { href: '/admin/memberships', label: 'Memberships', icon: '★' },
  { href: '/admin/campaigns', label: 'Campaigns', icon: '✉' },
  { href: '/admin/reports', label: 'Reports', icon: '◱' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙' },
];

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:block">
        <div className="flex h-16 items-center gap-2 border-b border-[var(--color-border)] px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.assets.logoMark} alt="" className="size-7 text-[var(--color-brand)]" aria-hidden />
          <span className="truncate text-sm font-semibold">{brand.shortName}</span>
        </div>
        <nav className="space-y-0.5 p-2" aria-label="Admin">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            >
              <span aria-hidden className="w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--color-border)] p-3">
          <Link
            href="/"
            className="block rounded-lg px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
          >
            ← Client site
          </Link>
        </div>
      </aside>

      {/* Mobile top bar — the front desk runs this on a tablet or phone */}
      <div className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)] lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="text-sm font-semibold">{brand.shortName}</span>
          <Link href="/" className="text-sm text-[var(--color-muted)]">Client site</Link>
        </div>
        <nav className="scroll-x flex gap-1 border-t border-[var(--color-border)] px-2 py-2" aria-label="Admin">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-[var(--color-muted)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <main id="main" className="lg:pl-56">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

export const metadata = {
  title: { default: `Admin · ${brand.name}`, template: `%s · Admin` },
  description: `Operations dashboard for ${brand.name}.`,
  robots: { index: false, follow: false },
};

// Admin figures must never be served from a cache — a stale rebooking
// queue sends the front desk to call someone who already booked.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
