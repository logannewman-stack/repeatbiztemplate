'use client';

/**
 * ============================================================================
 * APP FRAME
 * ============================================================================
 * The persistent chrome: one non-scrolling frame, one scrolling region, one
 * tab bar. Lives in the route-group layout, so moving between tabs never
 * remounts it — the bar does not flicker or re-animate, the way it would if
 * every page drew its own.
 *
 * The page itself never scrolls. A scrolling document on iOS drags the whole
 * viewport and sticky bars visibly detach and settle when it does; a fixed
 * frame with one scrolling child is how native gets bars that simply do not
 * move.
 *
 * Between the two sits a slot for whatever the current screen wants pinned —
 * a booking summary, a confirm button. It lives here rather than inside the
 * screen because `position: fixed` does not work in there: the pull-to-refresh
 * wrapper is transformed, and a transformed ancestor becomes the containing
 * block for its fixed descendants. A bar that thinks it is pinned to the
 * viewport instead sits at the bottom of the scrolling content, out of sight
 * until it lands on top of a button.
 * ============================================================================
 */

import * as React from 'react';
import { TabBar, type TabItem } from './TabBar';
import { PullToRefresh } from './PullToRefresh';

/** Where `Screen` portals its footer. Null until the frame has mounted. */
export const FooterSlotContext = React.createContext<HTMLElement | null>(null);

export function AppFrame({
  children, tabs,
}: {
  children: React.ReactNode;
  tabs: TabItem[];
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [footerSlot, setFooterSlot] = React.useState<HTMLElement | null>(null);

  return (
    <div className="app-frame">
      {/* `relative` so the refresh indicator positions against the scrolling
          region rather than the viewport. */}
      <div ref={scrollRef} className="app-scroll relative">
        <FooterSlotContext.Provider value={footerSlot}>
          <PullToRefresh scrollRef={scrollRef}>{children}</PullToRefresh>
        </FooterSlotContext.Provider>
      </div>

      {/* A flex sibling, so it takes real space and the scrolling region
          shrinks to fit rather than hiding its last row underneath. Empty it
          collapses to nothing. */}
      <div ref={setFooterSlot} className="shrink-0 empty:hidden" />

      <TabBar tabs={tabs} />
    </div>
  );
}
