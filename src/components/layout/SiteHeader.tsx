import Link from 'next/link';
import { brand } from '@/config/brand';
import { vertical } from '@/config/verticals';
import { Button } from '@/components/ui';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-[var(--color-brand)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.assets.logoMark} alt="" className="size-8" aria-hidden />
          <span className="font-semibold text-[var(--color-fg)]">{brand.name}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <NavLink href="/#services">Services</NavLink>
          <NavLink href="/memberships">{brand.copy.membershipName}s</NavLink>
          <NavLink href="/#team">Our {vertical.providerNounPlural}</NavLink>
          <NavLink href="/account">My {vertical.visitNounPlural}</NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={`tel:${brand.contact.phone.replace(/\D/g, '')}`}
            className="hidden text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)] sm:block"
          >
            {brand.contact.phone}
          </a>
          <Link href="/book">
            <Button size="sm">{brand.copy.bookCta}</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
    >
      {children}
    </Link>
  );
}
