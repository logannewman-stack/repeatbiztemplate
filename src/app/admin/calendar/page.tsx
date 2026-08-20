import { loadBrand } from '@/lib/brand';
import { loadCalendar, weekRange } from '@/lib/admin/calendar';
import { vertical } from '@/config/verticals';
import { Calendar, type CalendarView } from '@/components/admin/Calendar';
import { Badge, ButtonLink } from '@/components/ui';
import { formatMoney } from '@/lib/utils';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const { businessId, timezone, currency } = await loadBrand();

  const view: CalendarView = params.view === 'week' ? 'week' : 'day';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '')
    ? params.date!
    : todayInZone(timezone);

  const [from, to] = view === 'week' ? weekRange(date) : [date, date];

  const data = await loadCalendar(businessId, from, to, timezone, currency);

  const shift = (days: number) => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const step = view === 'week' ? 7 : 1;

  // Headline numbers for the range, so the page answers "how is today going?"
  // before anyone has to read the grid.
  const active = data.appointments.filter(
    (a) => !['cancelled', 'rescheduled'].includes(a.status)
  );
  const booked = active.reduce((sum, a) => sum + a.priceCents + a.addonsCents, 0);
  const unconfirmed = active.filter((a) => a.status === 'booked').length;
  const newClients = active.filter((a) => a.isNewClient).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {formatHeading(view, date, from, to, timezone)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
            <ButtonLink
              href={`/admin/calendar?view=${view}&date=${shift(-step)}`}
              variant="ghost"
              size="sm"
              className="rounded-none"
              aria-label="Previous"
            >
              ←
            </ButtonLink>
            <ButtonLink
              href={`/admin/calendar?view=${view}&date=${todayInZone(timezone)}`}
              variant="ghost"
              size="sm"
              className="rounded-none border-x border-[var(--color-border)]"
            >
              Today
            </ButtonLink>
            <ButtonLink
              href={`/admin/calendar?view=${view}&date=${shift(step)}`}
              variant="ghost"
              size="sm"
              className="rounded-none"
              aria-label="Next"
            >
              →
            </ButtonLink>
          </div>

          <div className="flex overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
            <ButtonLink
              href={`/admin/calendar?view=day&date=${date}`}
              variant={view === 'day' ? 'primary' : 'ghost'}
              size="sm"
              className="rounded-none"
            >
              Day
            </ButtonLink>
            <ButtonLink
              href={`/admin/calendar?view=week&date=${date}`}
              variant={view === 'week' ? 'primary' : 'ghost'}
              size="sm"
              className="rounded-none"
            >
              Week
            </ButtonLink>
          </div>

          <ButtonLink href="/book" size="sm">New {vertical.visitNoun}</ButtonLink>
        </div>
      </header>

      {active.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">
            {active.length} {active.length === 1 ? vertical.visitNoun : vertical.visitNounPlural}
          </Badge>
          <Badge tone="success">{formatMoney(booked, currency)} booked</Badge>
          {unconfirmed > 0 && (
            <Badge tone="warning">{unconfirmed} unconfirmed</Badge>
          )}
          {newClients > 0 && (
            <Badge tone="accent">
              {newClients} new {newClients === 1 ? vertical.clientNoun : vertical.clientNounPlural}
            </Badge>
          )}
        </div>
      )}

      <Calendar
        view={view}
        date={date}
        appointments={data.appointments}
        providers={data.providers}
        timeOff={data.timeOff}
        hoursByDate={data.hoursByDate}
        timezone={data.timezone}
        currency={data.currency}
        visitNoun={vertical.visitNoun}
        demo={data.demo}
      />
    </div>
  );
}

function todayInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatHeading(
  view: CalendarView, date: string, from: string, to: string, timeZone: string
): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts })
      .format(new Date(`${d}T12:00:00Z`));

  if (view === 'day') {
    return fmt(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  return `${fmt(from, { month: 'short', day: 'numeric' })} – ${fmt(to, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
