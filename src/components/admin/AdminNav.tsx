'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Admin navigation. A fixed sidebar on desktop, a horizontally scrolling strip
 * on mobile — the front desk runs this on a tablet or a phone, and a hamburger
 * that hides the calendar behind two taps is the wrong trade there.
 */
export function AdminNav({
  items, businessName, logoMark,
}: {
  items: Array<{ href: string; label: string; icon: string }>;
  businessName: string;
  logoMark: string;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-[var(--color-border)] px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMark} alt="" className="size-7 rounded object-contain" aria-hidden />
          <span className="truncate text-sm font-semibold">{businessName}</span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Admin">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]'
              )}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-[var(--color-border)] p-2">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
          >
            <Icon name="external" />
            Client site
          </Link>
        </div>
      </aside>

      {/* Mobile */}
      <div className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)] lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoMark} alt="" className="size-6 rounded object-contain" aria-hidden />
            <span className="text-sm font-semibold">{businessName}</span>
          </span>
          <Link href="/" className="text-sm text-[var(--color-muted)]">
            Client site
          </Link>
        </div>

        <nav
          className="scroll-x flex gap-1 border-t border-[var(--color-border)] px-2 py-2"
          aria-label="Admin"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]'
                  : 'text-[var(--color-muted)]'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}

/** Inline icons — a 200KB icon package for eleven glyphs is not a good trade. */
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
    repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 5.5a3.5 3.5 0 010 6.5" /><path d="M17.5 14.5a6.5 6.5 0 014 5.5" /></>,
    tag: <><path d="M3 12V4a1 1 0 011-1h8l9 9-9 9-9-9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
    badge: <><circle cx="12" cy="9" r="4" /><path d="M5 21a7 7 0 0114 0" /></>,
    star: <path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8L12 3z" />,
    mail: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    sliders: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="7" cy="18" r="2" fill="currentColor" stroke="none" /></>,
    external: <><path d="M14 4h6v6" /><path d="M20 4l-8 8" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></>,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name] ?? paths.grid}
    </svg>
  );
}
