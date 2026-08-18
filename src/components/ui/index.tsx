/**
 * ============================================================================
 * UI PRIMITIVES
 * ============================================================================
 * Small, unstyled-ish building blocks that read from the brand tokens. Kept
 * deliberately minimal — a fork should be able to restyle the whole app from
 * `src/config/brand.ts` without touching component internals.
 * ============================================================================
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

// --- Button -----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-brand)] text-[var(--color-brand-fg)] hover:opacity-90 shadow-sm',
  accent:
    'bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:opacity-90 shadow-sm',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-fg)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
  ghost:
    'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]',
  danger:
    'bg-[var(--color-danger)] text-white hover:opacity-90',
};

const buttonSizes: Record<ButtonSize, string> = {
  // 44px minimum height on md/lg — the smallest reliable touch target.
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, fullWidth, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-card)] font-medium',
        'transition-opacity disabled:opacity-50 disabled:pointer-events-none',
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

// --- Card -------------------------------------------------------------------

export function Card({
  className, children, ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--color-border)]',
        'bg-[var(--color-surface)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title, description, action, className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 p-5 pb-3', className)}>
      <div className="min-w-0">
        <h3 className="font-semibold leading-tight">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({
  className, children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)}>{children}</div>;
}

// --- Badge ------------------------------------------------------------------

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'accent';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
  brand: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]',
  success: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  accent: 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]',
};

export function Badge({
  tone = 'neutral', className, children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// --- Form controls ----------------------------------------------------------

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-11 w-full rounded-[var(--radius-card)] border border-[var(--color-border)]',
      'bg-[var(--color-surface)] px-3 text-[var(--color-fg)]',
      'placeholder:text-[var(--color-muted)]',
      'disabled:opacity-60',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-[var(--radius-card)] border border-[var(--color-border)]',
      'bg-[var(--color-surface)] p-3 text-[var(--color-fg)]',
      'placeholder:text-[var(--color-muted)]',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-11 w-full rounded-[var(--radius-card)] border border-[var(--color-border)]',
      'bg-[var(--color-surface)] px-3 text-[var(--color-fg)]',
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function Field({
  label, hint, error, required, htmlFor, children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-[var(--color-danger)]">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  );
}

// --- Layout helpers ---------------------------------------------------------

export function Stat({
  label, value, delta, hint, tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  /** Percentage change vs the comparison period. */
  delta?: number | null;
  hint?: string;
  tone?: BadgeTone;
}) {
  const deltaTone =
    delta == null ? null : delta > 0 ? 'success' : delta < 0 ? 'danger' : 'neutral';

  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {deltaTone && (
          <Badge tone={deltaTone as BadgeTone}>
            {delta! > 0 ? '+' : ''}{delta}%
          </Badge>
        )}
        {tone !== 'neutral' && !deltaTone && <Badge tone={tone}>&nbsp;</Badge>}
      </div>
      {hint && <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>}
    </Card>
  );
}

export function EmptyState({
  icon, title, description, action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] px-6 py-12 text-center">
      {icon && <div className="mb-3 text-[var(--color-muted)]">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = 'brand', title, children,
}: {
  tone?: BadgeTone;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] p-4 text-sm',
        badgeTones[tone]
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className={cn(title && 'mt-1')}>{children}</div>
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) {
    return <hr className="border-t border-[var(--color-border)]" />;
  }
  return (
    <div className="flex items-center gap-3">
      <hr className="flex-1 border-t border-[var(--color-border)]" />
      <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </span>
      <hr className="flex-1 border-t border-[var(--color-border)]" />
    </div>
  );
}
