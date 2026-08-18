import type { Metadata, Viewport } from 'next';
import { brand, radiusScale } from '@/config/brand';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: `${brand.name} — Book Online`,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  openGraph: {
    title: brand.name,
    description: brand.tagline,
    type: 'website',
    images: [brand.assets.ogImage],
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: brand.shortName,
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Booking forms must stay zoomable — never set maximumScale here.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1d21' },
  ],
};

/**
 * The brand palette is injected as inline custom properties so a fork only
 * has to edit `src/config/brand.ts` — no CSS changes, no rebuild of tokens.
 */
function brandStyle(): React.CSSProperties {
  return {
    '--color-brand': brand.colors.brand,
    '--color-brand-fg': brand.colors.brandForeground,
    '--color-accent': brand.colors.accent,
    '--color-accent-fg': brand.colors.accentForeground,
    '--color-success': brand.colors.success,
    '--color-warning': brand.colors.warning,
    '--color-danger': brand.colors.danger,
    '--radius-card': radiusScale[brand.radius],
    '--font-heading': brand.fonts.heading,
    '--font-body': brand.fonts.body,
  } as React.CSSProperties;
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={brandStyle()}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--color-brand)] focus:px-4 focus:py-2 focus:text-[var(--color-brand-fg)]"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
