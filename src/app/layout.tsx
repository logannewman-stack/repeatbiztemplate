import type { Metadata, Viewport } from 'next';
import { loadBrand, brandCssVars } from '@/lib/brand';
import { resolveAppUrl } from '@/lib/url';
import './globals.css';

/**
 * Metadata resolves per request from the database, so a client who renames
 * their business or swaps their logo in Admin → Setup sees it in the browser
 * tab and in link previews immediately — no redeploy.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await loadBrand();

  return {
    // resolveAppUrl() never throws. A raw env var here fails the whole
    // production build, not the request — see src/lib/url.ts.
    metadataBase: new URL(resolveAppUrl()),
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
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Booking forms must stay zoomable — never set maximumScale here.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1d21' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { brand } = await loadBrand();

  return (
    <html lang="en" suppressHydrationWarning>
      <body style={brandCssVars(brand)}>
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
