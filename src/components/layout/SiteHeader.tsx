import Link from 'next/link';
import { loadBrand } from '@/lib/brand';
import { vertical } from '@/config/verticals';
import { Button } from '@/components/ui';

export async function SiteHeader() {
  const { brand } = await loadBrand();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.assets.logo}
            alt={brand.name}
            className="h-8 max-w-44 object-contain object-left"
          />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <NavLink href="/#services">Services</NavLink>
          <NavLink href="/memberships">{brand.copy.membershipName}s</NavLink>
          <NavLink href="/#team">Our {vertical.providerNounPlural}</NavLink>
          <NavLink href="/account">My {vertical.visitNounPlural}</NavLink>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`tel:${brand.contact.phone.replace(/\D/g, '')}`}
            className="hidden text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] sm:block"
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
