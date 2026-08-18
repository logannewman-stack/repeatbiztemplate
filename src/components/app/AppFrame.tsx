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
 * ============================================================================
 */

import * as React from 'react';
import { TabBar, type TabItem } from './TabBar';

export function AppFrame({
  children, tabs,
}: {
  children: React.ReactNode;
  tabs: TabItem[];
}) {
  return (
    <div className="app-frame">
      <div className="app-scroll">{children}</div>
      <TabBar tabs={tabs} />
    </div>
  );
}
