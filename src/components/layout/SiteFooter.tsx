import Link from 'next/link';
import { loadBrand } from '@/lib/brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured, demoLocation } from '@/lib/demo';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Hours {
  weekday: number;
  open?: string;
  close?: string;
  closed?: boolean;
}

export async function SiteFooter() {
  const { brand, businessId } = await loadBrand();

  let location = {
    address_line1: demoLocation().address_line1,
    city: demoLocation().city,
    region: demoLocation().region,
    postal_code: demoLocation().postal_code,
    hours: demoLocation().hours as Hours[],
  };

  if (isSupabaseConfigured() && businessId) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('locations')
      .select('address_line1, city, region, postal_code, hours')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('sort_order')
      .limit(1)
      .maybeSingle();

    if (data) {
      location = {
        address_line1: data.address_line1 ?? '',
        city: data.city ?? '',
        region: data.region ?? '',
        postal_code: data.postal_code ?? '',
        hours: Array.isArray(data.hours) ? (data.hours as unknown as Hours[]) : [],
      };
    }
  }

  return (
    <footer className="mt-16 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.assets.logo}
            alt={brand.name}
            className="h-8 max-w-44 object-contain object-left"
          />
          <p className="mt-3 text-sm text-[var(--color-muted)]">{brand.tagline}</p>
        </div>

        <div>
          <p className="text-sm font-semibold">Visit</p>
          <address className="mt-2 space-y-1 text-sm not-italic text-[var(--color-muted)]">
            {location.address_line1 && <p>{location.address_line1}</p>}
            {(location.city || location.region) && (
              <p>{location.city}{location.city && location.region ? ', ' : ''}{location.region} {location.postal_code}</p>
            )}
            <p>
              <a
                href={`tel:${brand.contact.phone.replace(/\D/g, '')}`}
                className="transition-colors hover:text-[var(--color-fg)]"
              >
                {brand.contact.phone}
              </a>
            </p>
            <p>
              <a
                href={`mailto:${brand.contact.email}`}
                className="transition-colors hover:text-[var(--color-fg)]"
              >
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
                  {h.closed || !h.open ? 'Closed' : `${h.open} – ${h.close}`}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <p className="text-sm font-semibold">Quick links</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-muted)]">
            <li><Link href="/book" className="transition-colors hover:text-[var(--color-fg)]">Book an appointment</Link></li>
            <li><Link href="/memberships" className="transition-colors hover:text-[var(--color-fg)]">{brand.copy.membershipName}s</Link></li>
            <li><Link href="/gift-cards" className="transition-colors hover:text-[var(--color-fg)]">Gift cards</Link></li>
            <li><Link href="/account" className="transition-colors hover:text-[var(--color-fg)]">My account</Link></li>
            <li><Link href="/policies" className="transition-colors hover:text-[var(--color-fg)]">Booking policies</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] px-4 py-6">
        <p className="mx-auto max-w-6xl text-xs text-[var(--color-muted)]">
          © {new Date().getFullYear()} {brand.name}.
        </p>
      </div>
    </footer>
  );
}
