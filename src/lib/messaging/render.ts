/**
 * ============================================================================
 * TEMPLATE RENDERING
 * ============================================================================
 * Messages are stored as text with `{{dotted.path}}` placeholders so an owner
 * can edit them from the admin UI without a deploy.
 *
 * Deliberately not a general-purpose template language. No loops, no
 * conditionals, no expression evaluation — those turn owner-editable content
 * into a code-injection surface. Substitution only.
 * ============================================================================
 */

export type TemplateVars = Record<string, unknown>;

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

function lookup(vars: TemplateVars, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, vars);
}

export interface RenderResult {
  text: string;
  /** Placeholders with no matching value. Surfaced in the template editor. */
  missing: string[];
}

export function render(template: string, vars: TemplateVars): RenderResult {
  const missing: string[] = [];

  const text = template.replace(PLACEHOLDER, (_match, path: string) => {
    const value = lookup(vars, path);
    if (value === undefined || value === null || value === '') {
      missing.push(path);
      return '';
    }
    return String(value);
  });

  // Collapse the whitespace an empty substitution leaves behind.
  return {
    text: text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
    missing,
  };
}

/** SMS segment count. Useful for showing cost in the template editor. */
export function smsSegments(text: string): { segments: number; unicode: boolean } {
  // GSM-7 covers most Latin text; anything else forces UCS-2 and halves the
  // characters per segment.
  const unicode = /[^\x20-\x7E\n\r£¥èéùìòÇØøÅåÆæßÉÄÖÑÜ§¿äöñüà]/.test(text);
  const perSegment = unicode ? 67 : 153;
  const single = unicode ? 70 : 160;
  const segments =
    text.length <= single ? 1 : Math.ceil(text.length / perSegment);
  return { segments, unicode };
}

/**
 * Build the merge variables for a message. Every template in the system draws
 * from this shape, so adding a field here makes it available everywhere.
 */
export interface BuildVarsInput {
  business: { name: string; phone?: string | null; address?: string | null; timezone: string };
  client: {
    first_name: string; last_name?: string | null;
    days_since_visit?: number | null; spend_90d_cents?: number | null;
    loyalty_points?: number | null;
  };
  appointment?: {
    starts_at: string; service_name: string; staff_name?: string | null;
    duration_min?: number; price_cents?: number;
  } | null;
  service?: { name: string; rebook_interval_days?: number } | null;
  staff?: { name: string } | null;
  membership?: {
    plan_name?: string; credits?: number; credits_expire_on?: string;
    grace_days?: number; savings_cents?: number; would_have_paid_cents?: number;
  } | null;
  offer?: { label?: string; code?: string; expires_minutes?: number } | null;
  slot?: { suggested?: string } | null;
  links: Record<string, string>;
  locale?: string;
  currency?: string;
}

function money(cents: number | null | undefined, currency = 'USD', locale = 'en-US') {
  if (cents == null) return '';
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function buildVars(input: BuildVarsInput): TemplateVars {
  const locale = input.locale ?? 'en-US';
  const currency = input.currency ?? 'USD';
  const tz = input.business.timezone;

  const fmtDateTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: tz, weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: tz, hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: tz, weekday: 'long', month: 'long', day: 'numeric',
    }).format(new Date(iso));

  return {
    business: {
      name: input.business.name,
      phone: input.business.phone ?? '',
      address: input.business.address ?? '',
    },
    client: {
      first_name: input.client.first_name,
      last_name: input.client.last_name ?? '',
      full_name: [input.client.first_name, input.client.last_name].filter(Boolean).join(' '),
      days_since_visit: input.client.days_since_visit ?? '',
      spend_90d: money(input.client.spend_90d_cents, currency, locale),
      loyalty_points: input.client.loyalty_points ?? '',
    },
    appointment: input.appointment
      ? {
          date_time: fmtDateTime(input.appointment.starts_at),
          date: fmtDate(input.appointment.starts_at),
          time: fmtTime(input.appointment.starts_at),
          service_name: input.appointment.service_name,
          staff_name: input.appointment.staff_name ?? '',
          duration: input.appointment.duration_min
            ? `${input.appointment.duration_min} min` : '',
          price: money(input.appointment.price_cents, currency, locale),
        }
      : {},
    service: input.service
      ? {
          name: input.service.name,
          rebook_interval: input.service.rebook_interval_days ?? '',
        }
      : {},
    staff: { name: input.staff?.name ?? input.appointment?.staff_name ?? '' },
    membership: input.membership
      ? {
          plan_name: input.membership.plan_name ?? '',
          credits: input.membership.credits ?? '',
          credits_expire_on: input.membership.credits_expire_on
            ? fmtDate(input.membership.credits_expire_on) : '',
          grace_days: input.membership.grace_days ?? '',
          savings: money(input.membership.savings_cents, currency, locale),
          would_have_paid: money(input.membership.would_have_paid_cents, currency, locale),
        }
      : {},
    offer: {
      label: input.offer?.label ?? '',
      code: input.offer?.code ?? '',
      expires_minutes: input.offer?.expires_minutes ?? '',
    },
    slot: { suggested: input.slot?.suggested ?? '' },
    link: input.links,
  };
}
