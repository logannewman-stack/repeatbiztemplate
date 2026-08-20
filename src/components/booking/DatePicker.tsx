'use client';

/**
 * ============================================================================
 * DATE PICKER
 * ============================================================================
 * A horizontal strip of days with availability baked in, plus a month grid for
 * anyone booking further out.
 *
 * The strip is the default because most bookings are within two weeks and a
 * thumb-scrollable row of dates beats a month grid on a phone. Days with no
 * availability are shown but disabled rather than hidden — a gap in the strip
 * reads as a bug, whereas a greyed-out Sunday reads as "they're closed".
 * ============================================================================
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface DayAvailability {
  /** YYYY-MM-DD */
  date: string;
  slotCount: number;
}

export function DatePicker({
  days, selected, onSelect, timezone, scarcityThreshold = 3,
}: {
  days: DayAvailability[];
  selected: string | null;
  onSelect: (date: string) => void;
  timezone: string;
  /** At or below this many open slots, show the scarcity badge. */
  scarcityThreshold?: number;
}) {
  const [showMonth, setShowMonth] = React.useState(false);
  const stripRef = React.useRef<HTMLDivElement>(null);

  // Keep the selected day in view when it changes from outside (e.g. the
  // "next available" shortcut).
  React.useEffect(() => {
    if (!selected || !stripRef.current) return;
    const el = stripRef.current.querySelector(`[data-date="${selected}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selected]);

  const firstOpen = days.find((d) => d.slotCount > 0);
  const totalOpen = days.reduce((sum, d) => sum + d.slotCount, 0);

  if (days.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {selected ? formatFullDate(selected, timezone) : 'Pick a day'}
        </p>
        <button
          type="button"
          onClick={() => setShowMonth((v) => !v)}
          className="text-sm text-[var(--color-brand)] underline-offset-4 hover:underline"
        >
          {showMonth ? 'Show next 2 weeks' : 'See more dates'}
        </button>
      </div>

      {showMonth ? (
        <MonthGrid
          days={days}
          selected={selected}
          onSelect={(date) => { onSelect(date); setShowMonth(false); }}
        />
      ) : (
        <div ref={stripRef} className="scroll-x -mx-1 flex gap-2 py-1 pe-5 ps-1">
          {days.slice(0, 21).map((day) => {
            const isSelected = day.date === selected;
            const open = day.slotCount > 0;
            const scarce = open && day.slotCount <= scarcityThreshold;

            return (
              <button
                key={day.date}
                type="button"
                data-date={day.date}
                disabled={!open}
                onClick={() => onSelect(day.date)}
                aria-pressed={isSelected}
                className={cn(
                  'relative flex min-w-16 shrink-0 flex-col items-center rounded-[var(--radius-card)] border px-3 py-2.5 transition-colors',
                  isSelected
                    ? 'border-transparent bg-[var(--color-brand)] text-[var(--color-brand-fg)] shadow-[var(--shadow-md)]'
                    : open
                      ? 'border-transparent bg-[var(--color-surface)] shadow-[var(--shadow-sm)]'
                      : 'cursor-not-allowed border-transparent bg-[var(--color-surface-2)] opacity-45'
                )}
              >
                <span className="text-[11px] uppercase opacity-70">
                  {DAY_LETTERS[weekdayOf(day.date)]}
                </span>
                <span className="text-lg font-semibold tabular-nums leading-tight">
                  {Number(day.date.slice(8, 10))}
                </span>
                {open ? (
                  scarce && !isSelected ? (
                    <span className="text-[10px] font-medium text-[var(--color-warning)]">
                      {day.slotCount} left
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-60">
                      {day.slotCount}
                    </span>
                  )
                ) : (
                  <span className="text-[10px] opacity-60">—</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {totalOpen === 0 ? null : !selected && firstOpen ? (
        <button
          type="button"
          onClick={() => onSelect(firstOpen.date)}
          className="text-sm text-[var(--color-brand)] underline-offset-4 hover:underline"
        >
          Jump to the next available day →
        </button>
      ) : null}
    </div>
  );
}

function MonthGrid({
  days, selected, onSelect,
}: {
  days: DayAvailability[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const byDate = React.useMemo(
    () => new Map(days.map((d) => [d.date, d.slotCount])),
    [days]
  );

  // Show every month the range touches, so a 120-day booking horizon is
  // reachable without paging.
  const months = React.useMemo(() => {
    const set = new Set(days.map((d) => d.date.slice(0, 7)));
    return [...set].sort();
  }, [days]);

  const [monthIndex, setMonthIndex] = React.useState(() => {
    const target = selected?.slice(0, 7) ?? days[0]?.date.slice(0, 7);
    const found = months.indexOf(target ?? '');
    return found >= 0 ? found : 0;
  });

  const month = months[monthIndex];
  if (!month) return null;

  const [year, monthNum] = month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNum - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={monthIndex === 0}
          onClick={() => setMonthIndex(monthIndex - 1)}
          aria-label="Previous month"
          className="rounded-lg px-2 py-1 text-sm disabled:opacity-30"
        >
          ←
        </button>
        <span className="text-sm font-medium">
          {MONTHS[monthNum - 1]} {year}
        </span>
        <button
          type="button"
          disabled={monthIndex === months.length - 1}
          onClick={() => setMonthIndex(monthIndex + 1)}
          aria-label="Next month"
          className="rounded-lg px-2 py-1 text-sm disabled:opacity-30"
        >
          →
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {DAY_LETTERS.map((letter, i) => (
          <span key={i} className="py-1 text-[11px] text-[var(--color-muted)]">
            {letter}
          </span>
        ))}

        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const dayNum = i + 1;
          const date = `${month}-${String(dayNum).padStart(2, '0')}`;
          const count = byDate.get(date);
          const open = (count ?? 0) > 0;
          const isSelected = date === selected;
          // Outside the searched range entirely, not merely fully booked.
          const unknown = count === undefined;

          return (
            <button
              key={date}
              type="button"
              disabled={!open}
              onClick={() => onSelect(date)}
              aria-pressed={isSelected}
              className={cn(
                'relative aspect-square rounded-lg text-sm tabular-nums transition-colors',
                isSelected
                  ? 'bg-[var(--color-brand)] font-semibold text-[var(--color-brand-fg)]'
                  : open
                    ? 'hover:bg-[var(--color-brand-soft)]'
                    : 'cursor-not-allowed text-[var(--color-muted)] opacity-40'
              )}
            >
              {dayNum}
              {open && !isSelected && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 mx-auto size-1 rounded-full bg-[var(--color-brand)]"
                />
              )}
              {unknown && <span className="sr-only">Not available</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function formatFullDate(date: string, timeZone: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const today = new Date().toISOString().slice(0, 10);

  const diff = Math.round(
    (d.getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric',
  }).format(d);
}
