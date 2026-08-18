'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, CardBody, Badge, Alert, EmptyState, Avatar,
  Field, Input, Textarea, Select, Toggle, Divider,
} from '@/components/ui';
import { Modal, ImageUpload, useToast } from '@/components/ui/client';
import { saveStaff, saveStaffSchedule } from '@/app/admin/actions';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PALETTE = [
  '#4F7CAC', '#7A9E7E', '#C08552', '#8E6C88',
  '#5B8266', '#B5651D', '#3A6EA5', '#A0522D',
];

export interface StaffRow {
  id: string;
  displayName: string;
  title: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  bookable: boolean;
  active: boolean;
  priceMultiplier: number;
  color: string | null;
  avatarUrl: string | null;
  shifts: Array<{ weekday: number; start: string; end: string }>;
  serviceCount: number;
  upcomingCount: number;
}

export function StaffManager({
  staff, providerNoun, readOnly,
}: {
  staff: StaffRow[];
  providerNoun: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = React.useState<StaffRow | 'new' | null>(null);
  const [scheduling, setScheduling] = React.useState<StaffRow | null>(null);
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button disabled={readOnly} onClick={() => setEditing('new')}>
          Add {providerNoun}
        </Button>
      </div>

      {staff.length === 0 ? (
        <EmptyState
          title={`No ${providerNoun}s yet`}
          description="Nobody can book until at least one exists with a weekly schedule."
          action={
            <Button disabled={readOnly} onClick={() => setEditing('new')}>
              Add {providerNoun}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {staff.map((member) => {
            const hoursPerWeek = member.shifts.reduce((sum, shift) => {
              const [sh, sm] = shift.start.split(':').map(Number);
              const [eh, em] = shift.end.split(':').map(Number);
              return sum + (eh * 60 + em - sh * 60 - sm) / 60;
            }, 0);

            return (
              <Card key={member.id} className={!member.active ? 'opacity-60' : undefined}>
                <CardBody className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar
                      name={member.displayName}
                      src={member.avatarUrl}
                      color={member.color}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{member.displayName}</p>
                        {!member.active && <Badge tone="neutral">Inactive</Badge>}
                        {member.active && !member.bookable && (
                          <Badge tone="neutral">Not bookable</Badge>
                        )}
                        {member.role === 'owner' && <Badge tone="brand">Owner</Badge>}
                        {member.role === 'manager' && <Badge tone="brand">Manager</Badge>}
                      </div>
                      <p className="text-sm text-[var(--color-muted)]">
                        {member.title ?? providerNoun}
                      </p>
                      {member.priceMultiplier !== 1 && (
                        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                          Prices at {Math.round(member.priceMultiplier * 100)}% of base
                        </p>
                      )}
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-[var(--radius-card)] bg-[var(--color-surface-2)] p-2">
                      <dt className="text-xs text-[var(--color-muted)]">Hours/wk</dt>
                      <dd className="font-semibold tabular-nums">
                        {hoursPerWeek > 0 ? hoursPerWeek.toFixed(0) : '—'}
                      </dd>
                    </div>
                    <div className="rounded-[var(--radius-card)] bg-[var(--color-surface-2)] p-2">
                      <dt className="text-xs text-[var(--color-muted)]">Services</dt>
                      <dd className="font-semibold tabular-nums">{member.serviceCount}</dd>
                    </div>
                    <div className="rounded-[var(--radius-card)] bg-[var(--color-surface-2)] p-2">
                      <dt className="text-xs text-[var(--color-muted)]">Booked</dt>
                      <dd className="font-semibold tabular-nums">{member.upcomingCount}</dd>
                    </div>
                  </dl>

                  {member.bookable && member.shifts.length === 0 && (
                    <Alert tone="warning" className="mt-3">
                      No schedule set — this {providerNoun} cannot be booked.
                    </Alert>
                  )}

                  {member.bookable && member.serviceCount === 0 && (
                    <Alert tone="warning" className="mt-3">
                      Not assigned to any service — this {providerNoun} cannot be booked.
                    </Alert>
                  )}

                  {member.shifts.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {DAY_NAMES.map((day, weekday) => {
                        const dayShifts = member.shifts.filter((s) => s.weekday === weekday);
                        return (
                          <span
                            key={day}
                            title={
                              dayShifts.length
                                ? dayShifts.map((s) => `${s.start}–${s.end}`).join(', ')
                                : 'Off'
                            }
                            className={
                              'rounded px-1.5 py-0.5 text-xs ' +
                              (dayShifts.length
                                ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                                : 'bg-[var(--color-surface-2)] text-[var(--color-muted)]')
                            }
                          >
                            {day}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm" variant="secondary" disabled={readOnly}
                      onClick={() => setEditing(member)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm" variant="secondary" disabled={readOnly}
                      onClick={() => setScheduling(member)}
                    >
                      Schedule
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <StaffEditor
          member={editing === 'new' ? null : editing}
          providerNoun={providerNoun}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}

      {scheduling && (
        <ScheduleEditor
          member={scheduling}
          onClose={() => setScheduling(null)}
          onSaved={() => { setScheduling(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StaffEditor({
  member, providerNoun, onClose, onSaved,
}: {
  member: StaffRow | null;
  providerNoun: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    displayName: member?.displayName ?? '',
    title: member?.title ?? '',
    bio: member?.bio ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    role: member?.role ?? 'provider',
    bookable: member?.bookable ?? true,
    active: member?.active ?? true,
    priceMultiplier: member?.priceMultiplier ?? 1,
    color: member?.color ?? PALETTE[0],
    avatarUrl: member?.avatarUrl ?? null,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      open
      onClose={onClose}
      title={member ? `Edit ${member.displayName}` : `New ${providerNoun}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!form.displayName.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);

              const data = new FormData();
              if (member) data.set('id', member.id);
              data.set('displayName', form.displayName);
              data.set('title', form.title);
              data.set('bio', form.bio);
              data.set('email', form.email);
              data.set('phone', form.phone);
              data.set('role', form.role);
              data.set('bookable', String(form.bookable));
              data.set('active', String(form.active));
              data.set('priceMultiplier', String(form.priceMultiplier));
              data.set('color', form.color);
              if (form.avatarUrl) data.set('avatarUrl', form.avatarUrl);

              const result = await saveStaff(null, data);
              setBusy(false);

              if (result.ok) {
                toast(result.message ?? 'Saved.');
                onSaved();
              } else {
                setError(result.error);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="Name" required>
          <Input
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            placeholder="Alex Rivera"
          />
        </Field>

        <Field label="Title" hint="Shown on the booking page.">
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={`Senior ${providerNoun}`}
          />
        </Field>

        <Field label="Bio">
          <Textarea
            rows={3} value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            placeholder="Background, specialties, and training."
          />
        </Field>

        <ImageUpload
          name="avatarUrl"
          label="Photo"
          hint="A real headshot converts better than initials."
          value={form.avatarUrl}
          onChange={(url) => set('avatarUrl', url)}
          kind="media"
          aspect="square"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" hint="Used to invite them to sign in.">
            <Input
              type="email" value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel" value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Calendar color" hint="How their appointments look on the calendar.">
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => set('color', hex)}
                aria-label={`Use ${hex}`}
                className={
                  'size-8 rounded-full border transition-transform hover:scale-110 ' +
                  (form.color === hex
                    ? 'border-[var(--color-fg)] ring-2 ring-[var(--color-fg)] ring-offset-2 ring-offset-[var(--color-surface)]'
                    : 'border-black/10')
                }
                style={{ background: hex }}
              />
            ))}
          </div>
        </Field>

        <Divider label="Access and pricing" />

        <Field
          label="Role"
          hint="Owner sees billing. Manager sees everything else. Providers see their own book."
        >
          <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="provider">Provider</option>
            <option value="front_desk">Front desk</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
            <option value="read_only">Read only</option>
          </Select>
        </Field>

        <Field
          label="Price level"
          hint="Multiplier on every service price. 1.2 means this provider charges 20% more."
        >
          <Input
            type="number" step="0.05" min="0.1" max="5"
            value={form.priceMultiplier}
            onChange={(e) => set('priceMultiplier', Number(e.target.value))}
          />
        </Field>

        <Toggle
          checked={form.bookable}
          onChange={(v) => set('bookable', v)}
          label="Bookable"
          description="Off for front desk and managers who do not take appointments."
        />

        <Toggle
          checked={form.active}
          onChange={(v) => set('active', v)}
          label="Active"
          description="Off removes them from booking without deleting their history."
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

/**
 * Weekly schedule editor.
 *
 * Multiple shifts per day are supported because split shifts are normal in
 * this industry — someone works a morning, goes home, and comes back for
 * evening appointments. Modeling a day as one range would quietly make those
 * middle hours bookable.
 */
function ScheduleEditor({
  member, onClose, onSaved,
}: {
  member: StaffRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [shifts, setShifts] = React.useState(member.shifts);

  const byDay = (weekday: number) =>
    shifts.filter((s) => s.weekday === weekday);

  const addShift = (weekday: number) =>
    setShifts([...shifts, { weekday, start: '09:00', end: '17:00' }]);

  const removeShift = (weekday: number, index: number) => {
    let seen = -1;
    setShifts(
      shifts.filter((s) => {
        if (s.weekday !== weekday) return true;
        seen++;
        return seen !== index;
      })
    );
  };

  const updateShift = (
    weekday: number, index: number, key: 'start' | 'end', value: string
  ) => {
    let seen = -1;
    setShifts(
      shifts.map((s) => {
        if (s.weekday !== weekday) return s;
        seen++;
        return seen === index ? { ...s, [key]: value } : s;
      })
    );
  };

  const totalHours = shifts.reduce((sum, shift) => {
    const [sh, sm] = shift.start.split(':').map(Number);
    const [eh, em] = shift.end.split(':').map(Number);
    return sum + Math.max(eh * 60 + em - sh * 60 - sm, 0) / 60;
  }, 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={`${member.displayName}'s schedule`}
      description={`${totalHours.toFixed(1)} hours a week`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const result = await saveStaffSchedule(member.id, shifts);
              setBusy(false);
              if (result.ok) {
                toast(result.message ?? 'Schedule saved.');
                onSaved();
              } else {
                setError(result.error);
              }
            }}
          >
            Save schedule
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        {DAY_FULL.map((dayName, weekday) => {
          const dayShifts = byDay(weekday);
          return (
            <div
              key={dayName}
              className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{dayName}</span>
                <Button size="xs" variant="ghost" onClick={() => addShift(weekday)}>
                  + Shift
                </Button>
              </div>

              {dayShifts.length === 0 ? (
                <p className="mt-1 text-sm text-[var(--color-muted)]">Off</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {dayShifts.map((shift, index) => {
                    const invalid = shift.end <= shift.start;
                    return (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          value={shift.start}
                          onChange={(e) => updateShift(weekday, index, 'start', e.target.value)}
                          className="w-32"
                        />
                        <span className="text-[var(--color-muted)]">to</span>
                        <Input
                          type="time"
                          value={shift.end}
                          onChange={(e) => updateShift(weekday, index, 'end', e.target.value)}
                          className={'w-32 ' + (invalid ? 'border-[var(--color-danger)]' : '')}
                        />
                        <Button
                          size="xs" variant="ghost"
                          onClick={() => removeShift(weekday, index)}
                        >
                          Remove
                        </Button>
                        {invalid && (
                          <span className="text-xs text-[var(--color-danger)]">
                            End must be after start
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <Alert tone="neutral">
          Add more than one shift to a day for split schedules — the hours in
          between stay unbookable, which is what you want when someone goes home
          and comes back for evening appointments.
        </Alert>
      </div>
    </Modal>
  );
}
