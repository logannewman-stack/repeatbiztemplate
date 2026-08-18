import { loadTodaySchedule } from '@/lib/admin/queries';
import { vertical } from '@/config/verticals';
import { Card, CardHeader, CardBody, Badge, Alert, EmptyState } from '@/components/ui';
import { formatMoney, fullName, formatPhone } from '@/lib/utils';

export const metadata = { title: 'Calendar' };

export default async function CalendarPage() {
  const { appointments, demo } = await loadTodaySchedule();

  if (demo) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Calendar</h1>
        </header>
        <Alert tone="warning" title="Demo mode">
          The calendar reads live bookings only. Connect Supabase to see today&apos;s
          schedule — see <code>SETUP.md</code>.
        </Alert>
      </div>
    );
  }

  const rows = appointments as unknown as Array<{
    id: string; starts_at: string; ends_at: string; status: string;
    price_cents: number; duration_min: number;
    clients: { id: string; first_name: string; last_name: string | null; phone: string | null } | null;
    services: { name: string; rebook_interval_days: number } | null;
    staff: { display_name: string; color: string | null } | null;
  }>;

  const revenue = rows
    .filter((r) => ['completed', 'checked_in', 'in_progress'].includes(r.status))
    .reduce((sum, r) => sum + r.price_cents, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{formatMoney(revenue)}</p>
          <p className="text-xs text-[var(--color-muted)]">booked so far</p>
        </div>
      </header>

      <Card>
        <CardHeader
          title={`${rows.length} ${rows.length === 1 ? vertical.visitNoun : vertical.visitNounPlural}`}
          description="Ask every completed visit for the next one before they reach the door."
        />
        <CardBody className="px-0 pb-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nothing on the books today"
                description="Work the retention queue — that is where today's revenue is hiding."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {rows.map((appointment) => (
                <li key={appointment.id} className="flex items-center gap-3 px-5 py-3">
                  <div
                    aria-hidden
                    className="h-10 w-1 shrink-0 rounded-full"
                    style={{ background: appointment.staff?.color ?? 'var(--color-brand)' }}
                  />
                  <div className="w-16 shrink-0 text-sm font-medium tabular-nums">
                    {new Date(appointment.starts_at).toLocaleTimeString('en-US', {
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {fullName(
                        appointment.clients?.first_name, appointment.clients?.last_name
                      )}
                    </p>
                    <p className="truncate text-sm text-[var(--color-muted)]">
                      {appointment.services?.name} · {appointment.staff?.display_name}
                      {appointment.clients?.phone &&
                        ` · ${formatPhone(appointment.clients.phone)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {formatMoney(appointment.price_cents)}
                    </p>
                    <StatusBadge status={appointment.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'; label: string }> = {
    requested: { tone: 'warning', label: 'Requested' },
    booked: { tone: 'neutral', label: 'Booked' },
    confirmed: { tone: 'brand', label: 'Confirmed' },
    checked_in: { tone: 'brand', label: 'Checked in' },
    in_progress: { tone: 'brand', label: 'In chair' },
    completed: { tone: 'success', label: 'Done' },
    cancelled: { tone: 'danger', label: 'Cancelled' },
    no_show: { tone: 'danger', label: 'No-show' },
    rescheduled: { tone: 'neutral', label: 'Moved' },
  };
  const entry = map[status] ?? { tone: 'neutral' as const, label: status };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
