'use client';

/**
 * ============================================================================
 * SHEET
 * ============================================================================
 * A bottom sheet that can be thrown away with a thumb.
 *
 * A modal that only closes via an X button is the single clearest sign of a
 * website pretending to be an app. This tracks the finger 1:1, resists being
 * dragged upward the way a real sheet does, and dismisses on either distance
 * or velocity — a fast short flick should close it, a slow long drag should
 * not necessarily.
 * ============================================================================
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { haptic } from './platform';

/** Past this many px, release closes the sheet. */
const DISMISS_DISTANCE = 110;
/** ...or past this speed, in px/ms, regardless of distance. */
const DISMISS_VELOCITY = 0.45;

export function Sheet({
  open, onClose, title, children, footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panel = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef({ startY: 0, startT: 0, y: 0, active: false });
  const [dragY, setDragY] = React.useState(0);
  const [closing, setClosing] = React.useState(false);

  const close = React.useCallback(() => {
    setClosing(true);
    haptic();
    // Let the exit transition play before unmounting.
    window.setTimeout(() => {
      setClosing(false);
      setDragY(0);
      onClose();
    }, 220);
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    // The sheet owns the screen; the list behind it must not scroll with it.
    const scroller = document.querySelector<HTMLElement>('.app-scroll');
    const previous = scroller?.style.overflow;
    if (scroller) scroller.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      if (scroller) scroller.style.overflow = previous ?? '';
    };
  }, [open, close]);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    // Only start a drag from the grabber area, so content stays scrollable.
    drag.current = { startY: e.clientY, startT: e.timeStamp, y: 0, active: true };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const delta = e.clientY - drag.current.startY;
    // Upward drags get heavy resistance rather than moving the sheet off-screen.
    const y = delta < 0 ? delta / 6 : delta;
    drag.current.y = y;
    setDragY(y);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;

    const elapsed = Math.max(1, e.timeStamp - drag.current.startT);
    const velocity = drag.current.y / elapsed;

    if (drag.current.y > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      close();
    } else {
      setDragY(0);
    }
  };

  const dragging = drag.current.active;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        data-compact-target
        className={cn(
          'absolute inset-0 bg-black/40 transition-opacity',
          closing ? 'opacity-0 duration-200' : 'animate-fade-in'
        )}
        style={
          // Backdrop lightens as the sheet is pulled down, so the gesture feels
          // connected to the screen behind it.
          dragY > 0 ? { opacity: Math.max(0, 1 - dragY / 320) } : undefined
        }
      />

      <div
        ref={panel}
        className={cn(
          'relative max-h-[88svh] overflow-hidden rounded-t-[1.25rem] bg-[var(--color-bg)]',
          'shadow-[0_-8px_40px_rgba(0,0,0,0.28)]',
          !dragging && !closing && 'animate-sheet-in'
        )}
        style={{
          transform: closing ? 'translate3d(0,100%,0)' : `translate3d(0,${dragY}px,0)`,
          transition: dragging
            ? 'none'
            : `transform ${closing ? 220 : 340}ms var(--ease-ios)`,
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="cursor-grab touch-none active:cursor-grabbing"
        >
          <div className="flex justify-center pb-1 pt-2.5">
            <span className="h-1 w-9 rounded-full bg-[var(--color-border)]" />
          </div>

          {title && (
            <div className="px-5 pb-3 pt-1">
              <h2 className="text-[20px] font-semibold tracking-[-0.01em]">
                {title}
              </h2>
            </div>
          )}
        </div>

        <div className="max-h-[70svh] overflow-y-auto overscroll-contain px-5 pb-4">
          {children}
        </div>

        {footer && (
          <div className="hairline-t px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
