import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Money ------------------------------------------------------------------
// Everything monetary is stored and passed around as integer cents. Floats
// never touch a price in this codebase.

export function formatMoney(
  cents: number | null | undefined,
  currency = 'USD',
  locale = 'en-US'
): string {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // Drop the cents on round amounts: "$95" reads better than "$95.00".
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Always shows cents. Use on receipts and invoices where alignment matters. */
export function formatMoneyExact(cents: number, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

export function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

// --- Time -------------------------------------------------------------------

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const d1 = typeof a === 'string' ? new Date(a) : a;
  const d2 = typeof b === 'string' ? new Date(b) : b;
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

export function addDays(date: Date | string, days: number): Date {
  const d = new Date(typeof date === 'string' ? date : date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export function addMinutes(date: Date | string, minutes: number): Date {
  const d = new Date(typeof date === 'string' ? date : date.getTime());
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

/** "in 3 days", "2 weeks ago" — used across the retention queues. */
export function relativeDays(days: number): string {
  const abs = Math.abs(days);
  const unit =
    abs < 7 ? [abs, 'day'] :
    abs < 30 ? [Math.round(abs / 7), 'week'] :
    abs < 365 ? [Math.round(abs / 30), 'month'] :
    [Math.round(abs / 365), 'year'];
  const [n, label] = unit as [number, string];
  const plural = n === 1 ? label : `${label}s`;
  return days < 0 ? `${n} ${plural} ago` : `in ${n} ${plural}`;
}

// --- Misc -------------------------------------------------------------------

export function initials(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';
}

export function fullName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(' ') || 'Unnamed';
}

/** E.164 for SMS. Assumes a US number when no country code is present. */
export function toE164(phone: string | null | undefined, defaultCountry = '1'): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (phone.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '').replace(/^1/, '');
  if (d.length !== 10) return phone;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Human-readable, unambiguous codes for offers and gift cards. */
export function generateCode(prefix = '', length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return prefix ? `${prefix}-${out}` : out;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Deep merge used to layer DB policy overrides on top of config defaults. */
export function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return override as T;
  }
  if (typeof override !== 'object' || Array.isArray(override)) {
    return override as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    out[key] = key in out ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

/**
 * "a" or "an", for a noun that comes from config.
 *
 * Every vertical names a visit differently — appointment, session, treatment,
 * visit — and a hard-coded "a" reads as "a appointment" on the two of them
 * that start with a vowel. Not clever about it: this is a UI article for a
 * short configured noun, not a general-purpose linguist.
 */
export function article(noun: string): string {
  return /^[aeiou]/i.test(noun.trim()) ? 'an' : 'a';
}

/** "an appointment", "a visit". */
export function withArticle(noun: string): string {
  return `${article(noun)} ${noun}`;
}
