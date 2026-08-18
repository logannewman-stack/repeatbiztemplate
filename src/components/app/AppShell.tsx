/**
 * ============================================================================
 * APP SHELL
 * ============================================================================
 * Server half of the frame. Resolves the brand and the vertical's vocabulary,
 * then hands a plain tab list to the client component that needs `usePathname`.
 *
 * Every client-facing screen renders inside this. Admin does not — a manager
 * on a laptop wants a dense tool, not a phone shell.
 * ============================================================================
 */

import * as React from 'react';
import { loadBrand } from '@/lib/brand';
import { AppFrame } from './AppFrame';
import type { TabItem } from './TabBar';

/** A tab label has ~64px of width. Anything longer truncates and looks broken. */
function fit(word: string | undefined, fallback: string): string {
  if (!word) return fallback;
  const titled = word.charAt(0).toUpperCase() + word.slice(1);
  return titled.length <= 9 ? titled : fallback;
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { brand } = await loadBrand();

  const tabs: TabItem[] = [
    { href: '/', label: 'Home', icon: 'home' },
    {
      href: '/book',
      label: fit(brand.copy.bookCta.split(' ')[0], 'Book'),
      icon: 'calendar',
    },
    {
      href: '/memberships',
      label: fit(brand.copy.membershipName, 'Plans'),
      icon: 'sparkle',
      match: ['/gift-cards'],
    },
    {
      href: '/account',
      label: 'Account',
      icon: 'person',
      // A visit detail screen is still "Account", not a fifth tab.
      match: ['/account', '/login', '/a/'],
    },
  ];

  return <AppFrame tabs={tabs}>{children}</AppFrame>;
}
