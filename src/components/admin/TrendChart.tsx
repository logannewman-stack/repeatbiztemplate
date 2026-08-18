'use client';

import * as React from 'react';

/**
 * A compact bar trend. Deliberately dependency-free SVG rather than a charting
 * library: this renders one series of at most twelve points, and shipping a
 * charting runtime to every admin page to do it is not a trade worth making.
 */
export function TrendChart({
  data, format = 'number', tone = 'brand', invert = false,
}: {
  data: Array<{ label: string; value: number }>;
  format?: 'number' | 'percent' | 'currency';
  tone?: 'brand' | 'accent' | 'success' | 'danger';
  /** True when a lower value is the good outcome (no-shows). */
  invert?: boolean;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-muted)]">
        Not enough history yet.
      </p>
    );
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const color = `var(--color-${tone})`;
  const fmt = (v: number) =>
    format === 'percent' ? `${v.toFixed(1)}%`
    : format === 'currency' ? `$${v.toFixed(0)}`
    : v.toFixed(0);

  const latest = data.at(-1)!;
  const previous = data.at(-2);
  const improving = previous
    ? invert ? latest.value < previous.value : latest.value > previous.value
    : null;

  return (
    <figure>
      <figcaption className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{fmt(latest.value)}</span>
        {improving != null && (
          <span
            className="text-sm"
            style={{ color: improving ? 'var(--color-success)' : 'var(--color-danger)' }}
          >
            {improving ? '▲' : '▼'} vs {previous!.label}
          </span>
        )}
      </figcaption>

      <div className="flex h-24 items-end gap-1" role="img" aria-label={
        `Trend from ${data[0].label} to ${latest.label}. Latest ${fmt(latest.value)}.`
      }>
        {data.map((point) => {
          const heightPct = ((point.value - min) / range) * 100;
          return (
            <div key={point.label} className="group relative flex-1">
              <div
                className="w-full rounded-t transition-opacity group-hover:opacity-80"
                style={{
                  height: `${Math.max(heightPct, 3)}%`,
                  minHeight: '3px',
                  background: color,
                  opacity: point === latest ? 1 : 0.45,
                }}
              />
              <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--color-fg)] px-1.5 py-0.5 text-xs text-[var(--color-bg)] group-hover:block">
                {fmt(point.value)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between text-xs text-[var(--color-muted)]">
        <span>{data[0].label}</span>
        <span>{latest.label}</span>
      </div>
    </figure>
  );
}
