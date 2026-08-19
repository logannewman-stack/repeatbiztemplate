/**
 * ============================================================================
 * GROUPED LIST
 * ============================================================================
 * The inset-grouped list is the most recognisable control in iOS: rounded
 * card, rows separated by hairlines that stop short of the leading edge, a
 * chevron on anything that navigates.
 *
 * Web tables and card grids are the tell in the other direction, so most of
 * the account, membership and policy screens are better served by this.
 * ============================================================================
 */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function ListGroup({
  header, footer, children, className,
}: {
  /** Small uppercase caption above the group, as iOS section headers read. */
  header?: React.ReactNode;
  /** Explanatory text below — where the "why" of a setting belongs. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('px-4 py-2', className)}>
      {header && (
        <h3 className="px-1 pb-1.5 font-[family-name:var(--font-body)] text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">
          {header}
        </h3>
      )}

      <div className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
        {/* The inset separator: it starts at the text, not the card edge. */}
        <div className="divide-y divide-[var(--color-border)] [&>*+*]:border-t-0">
          {children}
        </div>
      </div>

      {footer && (
        <p className="px-1 pt-1.5 text-[13px] leading-snug text-[var(--color-muted)]">
          {footer}
        </p>
      )}
    </section>
  );
}

interface RowContent {
  /** Leading glyph or avatar. */
  icon?: React.ReactNode;
  /**
   * Leading thumbnail. Falls back to a tinted monogram tile when there is no
   * image, which is the usual case on a fresh install — an empty square would
   * read as a broken image, a monogram reads as deliberate.
   */
  media?: { src?: string | null; label: string };
  label: React.ReactNode;
  /** Second line, muted. */
  detail?: React.ReactNode;
  /** Trailing value, right-aligned and muted — the iOS "settings value". */
  value?: React.ReactNode;
  className?: string;
}

function RowInner({ icon, media, label, detail, value, chevron }: RowContent & { chevron?: boolean }) {
  return (
    <>
      {media && (
        media.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.src}
            alt=""
            className="size-11 shrink-0 rounded-[0.6rem] object-cover"
          />
        ) : (
          // A uniform glyph on a tint derived from the name. Initials collide
          // constantly in a service menu — three rows reading "S" looks
          // broken, whereas three tints read as a considered palette.
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-[0.6rem]"
            style={tintFor(media.label)}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M12 3.6 13.5 9l5.4 1.6-5.4 1.6L12 17.6l-1.5-5.4L5.1 10.6 10.5 9z" />
            </svg>
          </span>
        )
      )}

      {icon && (
        <span className="flex size-7 shrink-0 items-center justify-center text-[var(--color-brand)]">
          {icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] leading-tight">{label}</span>
        {detail && (
          <span className="mt-0.5 block truncate text-[13px] text-[var(--color-muted)]">
            {detail}
          </span>
        )}
      </span>

      {value && (
        <span className="shrink-0 text-[17px] text-[var(--color-muted)]">
          {value}
        </span>
      )}

      {chevron && (
        <svg
          width="8" height="14" viewBox="0 0 8 14" aria-hidden
          className="shrink-0 text-[var(--color-muted)] opacity-60"
          fill="none" stroke="currentColor" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M1.2 1.2 6.6 7l-5.4 5.8" />
        </svg>
      )}
    </>
  );
}

/**
 * A stable, low-chroma tint per label. Deterministic so a service keeps the
 * same colour between renders, and desaturated so a menu of them still reads
 * as one palette rather than a bag of highlighters.
 */
export function tintFor(label: string): React.CSSProperties {
  let hash = 7;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return {
    background: `oklch(0.945 0.035 ${hash})`,
    color: `oklch(0.45 0.085 ${hash})`,
  };
}

const ROW = 'flex w-full items-center gap-3 px-4 py-3 text-left';

/** A static row — a label and a value, nothing to tap. */
export function ListRow({ className, ...content }: RowContent) {
  return (
    <div className={cn(ROW, 'min-h-[var(--tap-min)]', className)}>
      <RowInner {...content} />
    </div>
  );
}

/** A row that navigates. Gets a chevron and a pressed background, like native. */
export function ListLink({
  href, external, className, ...content
}: RowContent & { href: string; external?: boolean }) {
  const inner = <RowInner {...content} chevron />;
  const classes = cn(
    ROW,
    'min-h-[var(--tap-min)] transition-colors active:bg-[var(--color-surface-2)]',
    className
  );

  if (external) {
    return (
      <a href={href} className={classes} data-press="row">
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} data-press="row">
      {inner}
    </Link>
  );
}
