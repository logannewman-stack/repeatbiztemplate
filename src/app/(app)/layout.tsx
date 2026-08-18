/**
 * Chrome for everything a client sees. Admin sits outside this group and keeps
 * its own dense, desktop-shaped layout.
 *
 * A route group changes no URLs — /book is still /book — it only gives these
 * routes a shared layout that survives navigation between them.
 */

import { AppShell, InstallPrompt } from '@/components/app';
import { loadBrand } from '@/lib/brand';

export default async function ClientAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { brand } = await loadBrand();

  return (
    <>
      <AppShell>{children}</AppShell>
      <InstallPrompt appName={brand.shortName || brand.name} />
    </>
  );
}
