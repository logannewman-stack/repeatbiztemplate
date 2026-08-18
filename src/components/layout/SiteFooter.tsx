import Link from 'next/link';
import { brand } from '@/config/brand';
import { demoLocation } from '@/lib/demo';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SiteFooter() {
  const location = demoLocation();

  return (
    <footer className="mt-16 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-semibold">{brand.name}</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">{brand.tagline}</p>
        </div>

        <div>
          <p className="text-sm font-semibold">Visit</p>
          <address className="mt-2 space-y-1 text-sm not-italic text-[var(--color-muted)]">
            <p>{location.address_line1}</p>
            <p>{location.city}, {location.region} {location.postal_code}</p>
            <p>
              <a href={`tel:${brand.contact.phone.replace(/\D/g, '')}`} className="hover:text-[var(--color-fg)]">
                {brand.contact.phone}
              </a>
            </p>
            <p>
              <a href={`mailto:${brand.contact.email}`} className="hover:text-[var(--color-fg)]">
                {brand.contact.email}
              </a>
            </p>
          </address>
        </div>

        <div>
          <p className="text-sm font-semibold">Hours</p>
          <dl className="mt-2 space-y-1 text-sm text-[var(--color-muted)]">
            {location.hours.map((h) => (
              <div key={h.weekday} className="flex justify-between gap-4">
                <dt>{DAYS[h.weekday]}</dt>
                <dd className="tabular-nums">
                  {h.closed ? 'Closed' : `${h.open} – ${h.close}`}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <p className="text-sm font-semibold">Quick links</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-muted)]">
            <li><Link href="/book" className="hover:text-[var(--color-fg)]">Book an appointment</Link></li>
            <li><Link href="/memberships" className="hover:text-[var(--color-fg)]">{brand.copy.membershipName}s</Link></li>
            <li><Link href="/gift-cards" className="hover:text-[var(--color-fg)]">Gift cards</Link></li>
            <li><Link href="/account" className="hover:text-[var(--color-fg)]">My account</Link></li>
            <li><Link href="/policies" className="hover:text-[var(--color-fg)]">Booking policies</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] px-4 py-6">
        <p className="mx-auto max-w-6xl text-xs text-[var(--color-muted)]">
          © {new Date().getFullYear()} {brand.name}. This is a template — replace this
          notice, the policies page, and all placeholder copy before launch.
        </p>
      </div>
    </footer>
  );
}
