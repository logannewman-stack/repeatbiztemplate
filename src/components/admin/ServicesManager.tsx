'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, CardBody, CardHeader, Badge, Alert, EmptyState,
  Field, Input, Textarea, Select, MoneyInput, Toggle, Divider,
  Table, Th, Td,
} from '@/components/ui';
import { Modal, ConfirmDialog, Tabs, useToast } from '@/components/ui/client';
import { saveService, deleteService, saveAddon, deleteAddon } from '@/app/admin/actions';
import { formatMoney, formatDuration } from '@/lib/utils';

export interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  durationMin: number;
  processingMin: number;
  finishMin: number;
  priceCents: number;
  memberPriceCents: number | null;
  rebookIntervalDays: number;
  depositMode: string;
  depositPercent: number;
  depositFlatCents: number;
  onlineBookable: boolean;
  active: boolean;
  sortOrder: number;
  providerCount: number;
  bookingCount: number;
}

export interface AddonRow {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  active: boolean;
  /** Percent of completed visits that included this add-on. */
  attachRate: number | null;
}

export function ServicesManager({
  services, addons, categories, currency, readOnly,
}: {
  services: ServiceRow[];
  addons: AddonRow[];
  categories: Array<{ id: string; name: string }>;
  currency: string;
  readOnly?: boolean;
}) {
  const [tab, setTab] = React.useState('services');
  const [editing, setEditing] = React.useState<ServiceRow | 'new' | null>(null);
  const [editingAddon, setEditingAddon] = React.useState<AddonRow | 'new' | null>(null);
  const [confirming, setConfirming] = React.useState<
    { kind: 'service' | 'addon'; id: string; name: string; hasHistory: boolean } | null
  >(null);

  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'services', label: 'Services', count: services.length },
          { id: 'addons', label: 'Add-ons', count: addons.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'services' && (
        <>
          <div className="flex justify-end">
            <Button disabled={readOnly} onClick={() => setEditing('new')}>
              Add service
            </Button>
          </div>

          {services.length === 0 ? (
            <EmptyState
              title="No services yet"
              description="Import a starter menu from Setup, or add your first service."
              action={
                <Button disabled={readOnly} onClick={() => setEditing('new')}>
                  Add service
                </Button>
              }
            />
          ) : (
            <Card>
              <Table
                minWidth="56rem"
                head={
                  <tr>
                    <Th>Service</Th>
                    <Th align="right">Duration</Th>
                    <Th align="right">Price</Th>
                    <Th align="right">Rebook</Th>
                    <Th align="right">Deposit</Th>
                    <Th align="center">Status</Th>
                    <Th align="right" />
                  </tr>
                }
              >
                {services.map((service) => (
                  <tr key={service.id} className={!service.active ? 'opacity-55' : undefined}>
                    <Td>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {service.categoryName ?? 'Uncategorized'}
                        {' · '}
                        {service.providerCount} provider{service.providerCount === 1 ? '' : 's'}
                        {service.providerCount === 0 && (
                          <span className="text-[var(--color-danger)]"> — not bookable</span>
                        )}
                      </p>
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatDuration(service.durationMin)}
                      {service.processingMin > 0 && (
                        <span className="block text-xs text-[var(--color-muted)]">
                          {service.processingMin}m gap
                        </span>
                      )}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatMoney(service.priceCents, currency)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {service.rebookIntervalDays}d
                    </Td>
                    <Td align="right" className="tabular-nums text-[var(--color-muted)]">
                      {service.depositMode === 'none'
                        ? '—'
                        : service.depositMode === 'percent'
                          ? `${service.depositPercent}%`
                          : service.depositMode === 'full'
                            ? 'Full'
                            : formatMoney(service.depositFlatCents, currency)}
                    </Td>
                    <Td align="center">
                      {!service.active ? (
                        <Badge tone="neutral">Archived</Badge>
                      ) : service.onlineBookable ? (
                        <Badge tone="success" dot>Online</Badge>
                      ) : (
                        <Badge tone="warning">In-house</Badge>
                      )}
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="xs" variant="secondary" disabled={readOnly}
                          onClick={() => setEditing(service)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="xs" variant="ghost" disabled={readOnly}
                          onClick={() =>
                            setConfirming({
                              kind: 'service', id: service.id, name: service.name,
                              hasHistory: service.bookingCount > 0,
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          <Alert tone="brand" title="Two fields do most of the work">
            <ul className="mt-1 space-y-1">
              <li>
                <strong>Rebook interval</strong> — days until a client is due back.
                It pre-selects the date on the rebooking prompt and drives the
                whole retention queue. Wrong here means nagging people at the
                wrong time.
              </li>
              <li>
                <strong>Processing gap</strong> — minutes in the middle where the
                provider is free (color developing, laser cooling). Set it and a
                second client can be booked into that window, which is the
                biggest capacity gain available to most salons.
              </li>
            </ul>
          </Alert>
        </>
      )}

      {tab === 'addons' && (
        <>
          <div className="flex justify-end">
            <Button disabled={readOnly} onClick={() => setEditingAddon('new')}>
              Add add-on
            </Button>
          </div>

          {addons.length === 0 ? (
            <EmptyState
              title="No add-ons yet"
              description="Add-ons are the cheapest way to lift average ticket — they cost nothing to offer."
              action={
                <Button disabled={readOnly} onClick={() => setEditingAddon('new')}>
                  Add add-on
                </Button>
              }
            />
          ) : (
            <Card>
              <Table
                minWidth="40rem"
                head={
                  <tr>
                    <Th>Add-on</Th>
                    <Th align="right">Time</Th>
                    <Th align="right">Price</Th>
                    <Th align="right">Attach rate</Th>
                    <Th align="right" />
                  </tr>
                }
              >
                {addons.map((addon) => (
                  <tr key={addon.id} className={!addon.active ? 'opacity-55' : undefined}>
                    <Td>
                      <p className="font-medium">{addon.name}</p>
                      {addon.description && (
                        <p className="text-xs text-[var(--color-muted)]">{addon.description}</p>
                      )}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {addon.durationMin > 0 ? `+${addon.durationMin}m` : '—'}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatMoney(addon.priceCents, currency)}
                    </Td>
                    <Td align="right">
                      {addon.attachRate == null ? (
                        <span className="text-[var(--color-muted)]">—</span>
                      ) : (
                        <Badge tone={addon.attachRate >= 20 ? 'success' : 'neutral'}>
                          {addon.attachRate}%
                        </Badge>
                      )}
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="xs" variant="secondary" disabled={readOnly}
                          onClick={() => setEditingAddon(addon)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="xs" variant="ghost" disabled={readOnly}
                          onClick={() =>
                            setConfirming({
                              kind: 'addon', id: addon.id, name: addon.name,
                              hasHistory: (addon.attachRate ?? 0) > 0,
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          <Alert tone="neutral">
            The booking flow shows at most three add-ons per service — more than
            that measurably hurts conversion. Order matters: the attach rate
            column tells you which ones deserve the slots.
          </Alert>
        </>
      )}

      {editing && (
        <ServiceEditor
          service={editing === 'new' ? null : editing}
          categories={categories}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}

      {editingAddon && (
        <AddonEditor
          addon={editingAddon === 'new' ? null : editingAddon}
          currency={currency}
          onClose={() => setEditingAddon(null)}
          onSaved={() => { setEditingAddon(null); router.refresh(); }}
        />
      )}

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={`Delete ${confirming?.name ?? ''}?`}
        message={
          confirming?.hasHistory
            ? 'This has booking history, so it will be archived and hidden rather than deleted — past receipts and reports need the record to stay intact.'
            : 'This has no history and will be permanently deleted.'
        }
        confirmLabel={confirming?.hasHistory ? 'Archive' : 'Delete'}
        danger
        onConfirm={async () => {
          if (!confirming) return;
          const result = confirming.kind === 'service'
            ? await deleteService(confirming.id)
            : await deleteAddon(confirming.id);
          if (result.ok) {
            toast(result.message ?? 'Deleted.');
            router.refresh();
          } else {
            toast(result.error, 'error');
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ServiceEditor({
  service, categories, currency, onClose, onSaved,
}: {
  service: ServiceRow | null;
  categories: Array<{ id: string; name: string }>;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    name: service?.name ?? '',
    description: service?.description ?? '',
    categoryId: service?.categoryId ?? '',
    durationMin: service?.durationMin ?? 60,
    processingMin: service?.processingMin ?? 0,
    finishMin: service?.finishMin ?? 0,
    price: ((service?.priceCents ?? 0) / 100).toFixed(2),
    memberPrice: service?.memberPriceCents != null
      ? (service.memberPriceCents / 100).toFixed(2) : '',
    rebookIntervalDays: service?.rebookIntervalDays ?? 30,
    depositMode: service?.depositMode ?? 'none',
    depositPercent: service?.depositPercent ?? 25,
    depositFlat: ((service?.depositFlatCents ?? 0) / 100).toFixed(2),
    onlineBookable: service?.onlineBookable ?? true,
    active: service?.active ?? true,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handsOnMin = form.durationMin - form.processingMin - form.finishMin;
  const gapValid = form.processingMin === 0 || handsOnMin > 0;

  async function submit() {
    setBusy(true);
    setError(null);

    const data = new FormData();
    if (service) data.set('id', service.id);
    data.set('name', form.name);
    data.set('description', form.description);
    data.set('categoryId', form.categoryId);
    data.set('durationMin', String(form.durationMin));
    data.set('processingMin', String(form.processingMin));
    data.set('finishMin', String(form.finishMin));
    data.set('price', form.price || '0');
    if (form.memberPrice) data.set('memberPrice', form.memberPrice);
    data.set('rebookIntervalDays', String(form.rebookIntervalDays));
    data.set('depositMode', form.depositMode);
    data.set('depositPercent', String(form.depositPercent));
    data.set('depositFlat', form.depositFlat || '0');
    data.set('onlineBookable', String(form.onlineBookable));
    data.set('active', String(form.active));

    const result = await saveService(null, data);
    setBusy(false);

    if (result.ok) {
      toast(result.message ?? 'Saved.');
      onSaved();
    } else {
      setError(result.error);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={service ? `Edit ${service.name}` : 'New service'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button loading={busy} disabled={!form.name.trim() || !gapValid} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="Name" required htmlFor="svc-name">
          <Input
            id="svc-name" value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Haircut & Style"
          />
        </Field>

        <Field label="Description" htmlFor="svc-desc" hint="Shown on the booking page.">
          <Textarea
            id="svc-desc" rows={2} value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

        {categories.length > 0 && (
          <Field label="Category">
            <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        )}

        <Divider label="Timing" />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Total minutes" required>
            <Input
              type="number" min={5} max={720} step={5}
              value={form.durationMin}
              onChange={(e) => set('durationMin', Number(e.target.value))}
            />
          </Field>
          <Field label="Processing gap" hint="0 if none">
            <Input
              type="number" min={0} max={300} step={5}
              value={form.processingMin}
              onChange={(e) => set('processingMin', Number(e.target.value))}
            />
          </Field>
          <Field label="Finishing time" hint="After the gap">
            <Input
              type="number" min={0} max={300} step={5}
              value={form.finishMin}
              onChange={(e) => set('finishMin', Number(e.target.value))}
            />
          </Field>
        </div>

        {form.processingMin > 0 && (
          <Alert tone={gapValid ? 'success' : 'danger'}>
            {gapValid ? (
              <>
                The provider works {handsOnMin} min, is free for{' '}
                {form.processingMin} min, then finishes for {form.finishMin} min.
                Another client can be booked into that free window.
              </>
            ) : (
              <>
                Processing plus finishing time ({form.processingMin + form.finishMin} min)
                leaves no hands-on time at the start. Increase the total, or
                reduce the gap.
              </>
            )}
          </Alert>
        )}

        <Divider label="Pricing" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price" required>
            <MoneyInput
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              symbol={currency === 'USD' ? '$' : ''}
            />
          </Field>
          <Field label="Member price" hint="Blank uses the plan's percentage.">
            <MoneyInput
              value={form.memberPrice}
              onChange={(e) => set('memberPrice', e.target.value)}
              placeholder="Auto"
              symbol={currency === 'USD' ? '$' : ''}
            />
          </Field>
        </div>

        <Divider label="Retention" />

        <Field
          label="Rebook interval (days)"
          required
          hint="Days until a client is due back. Drives the rebooking prompt and the retention queue."
        >
          <Input
            type="number" min={1} max={730}
            value={form.rebookIntervalDays}
            onChange={(e) => set('rebookIntervalDays', Number(e.target.value))}
          />
        </Field>

        <Divider label="Deposit" />

        <Field label="Deposit type">
          <Select value={form.depositMode} onChange={(e) => set('depositMode', e.target.value)}>
            <option value="none">No deposit</option>
            <option value="percent">Percentage of price</option>
            <option value="flat">Fixed amount</option>
            <option value="full">Full prepayment</option>
          </Select>
        </Field>

        {form.depositMode === 'percent' && (
          <Field label="Percent">
            <Input
              type="number" min={1} max={100}
              value={form.depositPercent}
              onChange={(e) => set('depositPercent', Number(e.target.value))}
            />
          </Field>
        )}

        {form.depositMode === 'flat' && (
          <Field label="Amount">
            <MoneyInput
              value={form.depositFlat}
              onChange={(e) => set('depositFlat', e.target.value)}
            />
          </Field>
        )}

        <Divider label="Visibility" />

        <Toggle
          checked={form.onlineBookable}
          onChange={(v) => set('onlineBookable', v)}
          label="Bookable online"
          description="Off means staff can book it, but clients cannot."
        />

        <Toggle
          checked={form.active}
          onChange={(v) => set('active', v)}
          label="Active"
          description="Off hides it everywhere without losing its history."
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function AddonEditor({
  addon, currency, onClose, onSaved,
}: {
  addon: AddonRow | null;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    name: addon?.name ?? '',
    description: addon?.description ?? '',
    durationMin: addon?.durationMin ?? 15,
    price: ((addon?.priceCents ?? 0) / 100).toFixed(2),
    active: addon?.active ?? true,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={addon ? `Edit ${addon.name}` : 'New add-on'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!form.name.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);

              const data = new FormData();
              if (addon) data.set('id', addon.id);
              data.set('name', form.name);
              data.set('description', form.description);
              data.set('durationMin', String(form.durationMin));
              data.set('price', form.price || '0');
              data.set('active', String(form.active));

              const result = await saveAddon(null, data);
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
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Deep conditioning treatment"
          />
        </Field>

        <Field label="Description">
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Extra minutes" hint="Added to the appointment length.">
            <Input
              type="number" min={0} max={240} step={5}
              value={form.durationMin}
              onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
            />
          </Field>
          <Field label="Price" required>
            <MoneyInput
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              symbol={currency === 'USD' ? '$' : ''}
            />
          </Field>
        </div>

        <Toggle
          checked={form.active}
          onChange={(v) => setForm({ ...form, active: v })}
          label="Active"
        />

        {!addon && (
          <Alert tone="neutral">
            New add-ons are offered on every active service. Narrow that later if
            it does not suit a particular one.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
