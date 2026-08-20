/**
 * ============================================================================
 * UI PRIMITIVES
 * ============================================================================
 * Every component reads the brand tokens emitted on `<body>`, so a color
 * change in Admin → Setup restyles the whole app without touching any of this.
 *
 * Sizing rules that are not negotiable, because this runs on a phone at a
 * front desk: interactive targets are at least 44px tall, inputs are at least
 * 16px so iOS does not zoom on focus, and nothing critical hides behind hover.
 * ============================================================================
 */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// --- Button -----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'outline';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-brand)] text-[var(--color-brand-fg)] shadow-sm hover:brightness-110 active:brightness-95',
  accent:
    'bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-sm hover:brightness-110 active:brightness-95',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-fg)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
  outline:
    'border border-[var(--color-brand)] text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]',
  ghost:
    'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]',
  danger:
    'bg-[var(--color-danger)] text-white shadow-sm hover:brightness-110',
};

const buttonSizes: Record<ButtonSize, string> = {
  xs: 'h-8 px-2.5 text-xs gap-1',
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

/**
 * Shared so a link that looks like a button *is* an anchor rather than a
 * `<button>` wrapped in one. That nesting is invalid HTML, and on iOS it
 * produces two overlapping tap targets whose press states fight each other.
 */
function buttonClasses(
  variant: ButtonVariant, size: ButtonSize, fullWidth?: boolean, className?: string
): string {
  return cn(
    'inline-flex items-center justify-center rounded-[var(--radius-card)] font-medium',
    'transition-[filter,background-color,opacity,transform] duration-150',
    'disabled:opacity-50 disabled:pointer-events-none select-none',
    // The press response native apps have and web buttons usually do not.
    'active:scale-[0.975]',
    buttonVariants[variant],
    buttonSizes[size],
    fullWidth && 'w-full',
    className
  );
}

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
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, fullWidth, className)}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

export interface ButtonLinkProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/**
 * A navigation target that looks like a button. Use this anywhere the tap goes
 * somewhere; keep `Button` for taps that *do* something.
 */
export function ButtonLink({
  className, variant = 'primary', size = 'md', fullWidth, children, ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, fullWidth, className)} {...props}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent',
        className
      )}
    />
  );
}

// --- Card -------------------------------------------------------------------

export function Card({
  className, children, ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--color-border)]',
        // Elevation, not just a border. A surface that sits on the page rather
        // than above it is what makes a UI read as unfinished.
        'bg-[var(--color-surface)] shadow-[var(--shadow-md)]',
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
    <div className={cn('flex flex-wrap items-start justify-between gap-3 p-5 pb-3', className)}>
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
  return <div className={cn('space-y-4 p-5 pt-0', className)}>{children}</div>;
}

export function CardFooter({
  className, children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] p-4',
        className
      )}
    >
      {children}
    </div>
  );
}

// --- Badge ------------------------------------------------------------------

export type BadgeTone =
  | 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'accent';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
  brand: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]',
  success: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  accent: 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]',
};

export function Badge({
  tone = 'neutral', className, children, dot,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
  /** Leading status dot. Reads faster than color alone in a dense table. */
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        badgeTones[tone],
        className
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// --- Form controls ----------------------------------------------------------

const fieldBase =
  'w-full rounded-[var(--radius-card)] border border-[var(--color-border)] ' +
  'bg-[var(--color-surface)] text-[var(--color-fg)] ' +
  'placeholder:text-[var(--color-muted)] ' +
  'transition-colors focus:border-[var(--color-brand)] ' +
  'disabled:opacity-60 disabled:bg-[var(--color-surface-2)]';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-11 px-3', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(fieldBase, 'p-3', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, 'h-11 px-3', className)} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';

/** Money input. Shows the currency symbol inline so nobody types "$" into it. */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { symbol?: string }
>(({ className, symbol = '$', ...props }, ref) => (
  <div className="relative">
    <span
      aria-hidden
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
    >
      {symbol}
    </span>
    <input
      ref={ref}
      type="number"
      step="0.01"
      min="0"
      inputMode="decimal"
      className={cn(fieldBase, 'h-11 pl-7 pr-3', className)}
      {...props}
    />
  </div>
));
MoneyInput.displayName = 'MoneyInput';

export function Field({
  label, hint, error, required, htmlFor, children, className,
}: {
  label?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
          {required && (
            <span className="ml-0.5 text-[var(--color-danger)]" aria-hidden>*</span>
          )}
        </label>
      )}
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

/** Switch styled as a real control rather than a raw checkbox. */
export function Toggle({
  checked, onChange, label, description, name, disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start justify-between gap-4',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="block text-xs text-[var(--color-muted)]">{description}</span>
        )}
      </span>
      <span className="relative shrink-0 pt-0.5">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            'block h-6 w-10 rounded-full transition-colors',
            checked ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-border)]'
          )}
        />
        <span
          aria-hidden
          className={cn(
            'absolute left-0.5 top-1 size-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </span>
    </label>
  );
}

/** Card-style radio. Far easier to hit on a phone than a native radio. */
export function OptionCard({
  selected, onSelect, title, description, trailing, icon, disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-[var(--radius-card)] border p-4 text-left',
        'transition-colors disabled:opacity-50',
        selected
          ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] ring-1 ring-[var(--color-brand)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]'
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {description && (
          <span className="mt-0.5 block text-sm text-[var(--color-muted)]">
            {description}
          </span>
        )}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </button>
  );
}

// --- Feedback ---------------------------------------------------------------

export function Alert({
  tone = 'brand', title, children, className,
}: {
  tone?: BadgeTone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn(
        'rounded-[var(--radius-card)] p-4 text-sm',
        badgeTones[tone],
        className
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-1')}>{children}</div>}
    </div>
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
      {icon && <div className="mb-3 text-2xl text-[var(--color-muted)]">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-[var(--radius-card)] bg-[var(--color-surface-2)]',
        className
      )}
    />
  );
}

// --- Data display -----------------------------------------------------------

export function Stat({
  label, value, delta, hint, tone, href, invertDelta,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  hint?: React.ReactNode;
  tone?: BadgeTone;
  href?: string;
  /** True when lower is better — no-shows, churn. Flips the arrow's meaning. */
  invertDelta?: boolean;
}) {
  const signal = delta == null ? 0 : invertDelta ? -delta : delta;
  const deltaTone: BadgeTone | null =
    delta == null ? null : signal > 0 ? 'success' : signal < 0 ? 'danger' : 'neutral';

  const body = (
    <Card
      className={cn(
        'h-full p-4',
        href && 'transition-colors hover:border-[var(--color-brand)]'
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {deltaTone && (
          <Badge tone={deltaTone}>
            {delta! > 0 ? '↑' : delta! < 0 ? '↓' : ''}{Math.abs(delta!)}%
          </Badge>
        )}
        {tone && !deltaTone && <Badge tone={tone}>&nbsp;</Badge>}
      </div>
      {hint && <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>}
    </Card>
  );

  return href ? <a href={href} className="block">{body}</a> : body;
}

export function Avatar({
  name, src, color, size = 'md', className,
}: {
  name: string;
  src?: string | null;
  color?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    xs: 'size-6 text-[10px]',
    sm: 'size-8 text-xs',
    md: 'size-10 text-sm',
    lg: 'size-14 text-lg',
  };

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn('shrink-0 rounded-full object-cover', sizes[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        sizes[size],
        className
      )}
      style={{ background: color || 'var(--color-brand)' }}
    >
      {initials || '?'}
    </span>
  );
}

export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) {
    return <hr className={cn('border-t border-[var(--color-border)]', className)} />;
  }
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <hr className="flex-1 border-t border-[var(--color-border)]" />
      <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </span>
      <hr className="flex-1 border-t border-[var(--color-border)]" />
    </div>
  );
}

export function ScrollX({
  className, children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('scroll-x', className)}>{children}</div>;
}

export function Table({
  head, children, minWidth = '48rem',
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <ScrollX>
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="border-y border-[var(--color-border)] bg-[var(--color-surface-2)] text-left">
          {head}
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">{children}</tbody>
      </table>
    </ScrollX>
  );
}

export function Th({
  children, align = 'left', className,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2 font-medium first:pl-5 last:pr-5',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children, align = 'left', className,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-3 py-3 first:pl-5 last:pr-5',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  );
}
