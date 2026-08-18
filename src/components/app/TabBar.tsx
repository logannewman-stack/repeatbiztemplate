'use client';

/**
 * ============================================================================
 * TAB BAR
 * ============================================================================
 * The single strongest "this is an app" signal there is. A person who has used
 * a phone knows what a bottom bar with four icons means before reading a word.
 *
 * Details that matter, all of which are wrong by default on the web:
 *  - it sits above the home indicator, not under it
 *  - it does not scroll away
 *  - the active tab is filled, not merely tinted
 *  - tapping the active tab scrolls its view to the top, as every iOS app does
 * ============================================================================
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { haptic } from './platform';

export interface TabItem {
  href: string;
  label: string;
  icon: TabIconName;
  /** Also treat these path prefixes as this tab. */
  match?: string[];
}

export function TabBar({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();

  const activeIndex = React.useMemo(() => {
    let best = -1;
    let bestLength = -1;

    tabs.forEach((tab, i) => {
      for (const prefix of [tab.href, ...(tab.match ?? [])]) {
        const hit =
          prefix === '/' ? pathname === '/' : pathname.startsWith(prefix);
        // Longest matching prefix wins, so /account/membership selects the
        // Account tab rather than whichever tab happened to be declared first.
        if (hit && prefix.length > bestLength) {
          best = i;
          bestLength = prefix.length;
        }
      }
    });

    return best;
  }, [pathname, tabs]);

  return (
    <nav
      aria-label="Main"
      className="app-chrome hairline-t relative z-40 shrink-0"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {tabs.map((tab, i) => {
          const active = i === activeIndex;

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                onClick={(event) => {
                  haptic();
                  // Re-tapping the current tab returns to the top instead of
                  // navigating nowhere.
                  if (active) {
                    event.preventDefault();
                    document
                      .querySelector('.app-scroll')
                      ?.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                data-compact-target
                className={cn(
                  'flex h-[var(--tabbar-height)] select-none flex-col items-center justify-center gap-[3px]',
                  'transition-colors duration-150',
                  active
                    ? 'text-[var(--color-brand)]'
                    : 'text-[var(--color-muted)] active:text-[var(--color-fg)]'
                )}
              >
                <TabIcon name={tab.icon} active={active} />
                <span className="text-[10px] font-medium leading-none tracking-tight">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* --- Icons -----------------------------------------------------------------
 * Inline rather than an icon package: four icons do not justify a dependency,
 * and these need a filled and an outline form of the same shape to read as
 * native. Filled-when-active is the iOS convention.
 * -------------------------------------------------------------------------- */

export type TabIconName = 'home' | 'calendar' | 'ticket' | 'person' | 'sparkle';

function TabIcon({ name, active }: { name: TabIconName; active: boolean }) {
  const common = {
    width: 25,
    height: 25,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    className: 'transition-transform duration-200',
    style: { transform: active ? 'scale(1.04)' : 'scale(1)' },
  } as const;

  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const fill = { fill: 'currentColor', stroke: 'none' };
  const paint = active ? fill : stroke;

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path
            {...paint}
            d="M3.6 10.4 12 3.8l8.4 6.6V20a1 1 0 0 1-1 1h-4.6v-6.2H9.2V21H4.6a1 1 0 0 1-1-1z"
          />
        </svg>
      );

    case 'calendar':
      return (
        <svg {...common}>
          <rect {...paint} x="3.2" y="5" width="17.6" height="16" rx="3.2" />
          <path
            fill="none"
            stroke={active ? 'var(--color-bg)' : 'currentColor'}
            strokeWidth={1.7}
            strokeLinecap="round"
            d="M8 3v4M16 3v4M3.6 10.2h16.8"
          />
          {active && (
            <circle cx="12" cy="15.4" r="1.9" fill="var(--color-bg)" />
          )}
        </svg>
      );

    case 'ticket':
      return (
        <svg {...common}>
          <path
            {...paint}
            d="M3 8.2A2.2 2.2 0 0 1 5.2 6h13.6A2.2 2.2 0 0 1 21 8.2v1.6a2.2 2.2 0 0 0 0 4.4v1.6A2.2 2.2 0 0 1 18.8 18H5.2A2.2 2.2 0 0 1 3 15.8v-1.6a2.2 2.2 0 0 0 0-4.4z"
          />
          <path
            fill="none"
            stroke={active ? 'var(--color-bg)' : 'currentColor'}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeDasharray="2 2.6"
            d="M14.2 7.4v9.2"
          />
        </svg>
      );

    case 'person':
      return (
        <svg {...common}>
          <circle {...paint} cx="12" cy="8.2" r="3.9" />
          <path
            {...paint}
            d="M4.6 20.4c0-3.6 3.3-5.9 7.4-5.9s7.4 2.3 7.4 5.9"
          />
        </svg>
      );

    case 'sparkle':
      return (
        <svg {...common}>
          <path
            {...paint}
            d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9z"
          />
        </svg>
      );
  }
}
