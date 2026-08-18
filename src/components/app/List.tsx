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
        <h3 className="px-1 pb-1.5 text-[13px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
          {header}
        </h3>
      )}

      <div className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)]">
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
  label: React.ReactNode;
  /** Second line, muted. */
  detail?: React.ReactNode;
  /** Trailing value, right-aligned and muted — the iOS "settings value". */
  value?: React.ReactNode;
  className?: string;
}

function RowInner({ icon, label, detail, value, chevron }: RowContent & { chevron?: boolean }) {
  return (
    <>
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
