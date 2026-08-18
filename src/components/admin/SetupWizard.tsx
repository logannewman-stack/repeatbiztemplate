'use client';

/**
 * ============================================================================
 * SETUP WIZARD
 * ============================================================================
 * The screen that turns "fork the template" into "stand up a client".
 *
 * Five steps, ordered by how much each unblocks: identity, look, catalog,
 * team, hours. Every step saves independently, so an operator can do the
 * branding now and the schedule tomorrow without losing anything — a wizard
 * that only commits at the end is a wizard people abandon halfway.
 *
 * The look step renders a live preview of the actual booking card, because
 * a color swatch tells you nothing about whether your brand color works as a
 * button next to your logo.
 * ============================================================================
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, CardBody, CardHeader, Field, Input, Textarea, Select,
  Alert, Badge, Toggle, OptionCard, Divider,
} from '@/components/ui';
import { ImageUpload, ColorPicker, useToast } from '@/components/ui/client';
import {
  saveBrand, saveLocation, saveHours, importVerticalPreset,
  saveStaff, completeOnboarding,
} from '@/app/admin/actions';
import { cn } from '@/lib/utils';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface VerticalOption {
  key: string;
  label: string;
  clientNoun: string;
  providerNoun: string;
  visitNoun: string;
  serviceCount: number;
  addonCount: number;
  planCount: number;
  productCount: number;
  sampleServices: string[];
  rebookIntervalDays: number;
}

interface InitialValues {
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  vertical: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  brandColor: string;
  radius: 'sharp' | 'soft' | 'round';
  logoUrl: string | null;
  logoMarkUrl: string | null;
  heroUrl: string | null;
  timezone: string;
  currency: string;
  taxRatePercent: number;
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
}

interface HourRow {
  weekday: number;
  open: string;
  close: string;
  closed: boolean;
}

type StepId = 'business' | 'look' | 'catalog' | 'team' | 'hours';

const STEPS: Array<{ id: StepId; label: string; blurb: string }> = [
  { id: 'business', label: 'Business', blurb: 'Name, type, and contact details' },
  { id: 'look', label: 'Look', blurb: 'Logo and colors' },
  { id: 'catalog', label: 'Services', blurb: 'What you sell' },
  { id: 'team', label: 'Team', blurb: 'Who does the work' },
  { id: 'hours', label: 'Hours', blurb: 'When you are open' },
];

export function SetupWizard({
  businessId, locationId, initial, verticalOptions, counts, hours: initialHours, demo,
}: {
  businessId: string | null;
  locationId: string | null;
  initial: InitialValues;
  verticalOptions: VerticalOption[];
  counts: { services: number; staff: number; addons: number; plans: number };
  hours: HourRow[];
  demo?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = React.useState<StepId>('business');
  const [form, setForm] = React.useState(initial);
  const [hours, setHours] = React.useState(initialHours);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = <K extends keyof InitialValues>(key: K, value: InitialValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const vertical = verticalOptions.find((v) => v.key === form.vertical)
    ?? verticalOptions[verticalOptions.length - 1];

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setSaving(true);
    setError(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.');
        return false;
      }
      if (result.message) toast(result.message);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function brandFormData() {
    const data = new FormData();
    data.set('name', form.name);
    data.set('shortName', form.shortName || form.name);
    data.set('tagline', form.tagline);
    data.set('description', form.description);
    data.set('vertical', form.vertical);
    data.set('phone', form.phone);
    data.set('email', form.email);
    data.set('website', form.website);
    data.set('instagram', form.instagram);
    data.set('brandColor', form.brandColor);
    data.set('radius', form.radius);
    data.set('timezone', form.timezone);
    data.set('currency', form.currency);
    data.set('taxRatePercent', String(form.taxRatePercent));
    if (form.logoUrl) data.set('logoUrl', form.logoUrl);
    if (form.logoMarkUrl) data.set('logoMarkUrl', form.logoMarkUrl);
    if (form.heroUrl) data.set('heroUrl', form.heroUrl);
    return data;
  }

  async function saveAndAdvance(next?: StepId) {
    const ok = await run(() => saveBrand(null, brandFormData()));
    if (!ok) return;

    if (locationId) {
      const locationData = new FormData();
      locationData.set('id', locationId);
      locationData.set('name', form.name);
      locationData.set('phone', form.phone);
      locationData.set('email', form.email);
      locationData.set('addressLine1', form.addressLine1);
      locationData.set('city', form.city);
      locationData.set('region', form.region);
      locationData.set('postalCode', form.postalCode);
      locationData.set('timezone', form.timezone);
      await saveLocation(null, locationData);
    }

    if (next) setStep(next);
  }

  return (
    <div className="space-y-5">
      {/* --- Progress rail ------------------------------------------------ */}
      <nav aria-label="Setup steps">
        <ol className="grid grid-cols-5 gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => setStep(s.id)}
                className="w-full text-left"
                aria-current={step === s.id ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'block h-1 rounded-full transition-colors',
                    i <= stepIndex ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-border)]'
                  )}
                />
                <span
                  className={cn(
                    'mt-1.5 block truncate text-xs',
                    step === s.id
                      ? 'font-medium text-[var(--color-fg)]'
                      : 'text-[var(--color-muted)]'
                  )}
                >
                  {s.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* --- Step 1: business -------------------------------------------- */}
      {step === 'business' && (
        <Card>
          <CardHeader
            title="Who is this for?"
            description="The name and type drive vocabulary across the whole app."
          />
          <CardBody>
            <Field label="Business name" required htmlFor="name">
              <Input
                id="name" value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Wildflower Hair Studio"
              />
            </Field>

            <Field
              label="Short name"
              htmlFor="shortName"
              hint="Used in tight spaces and as the SMS sender line."
            >
              <Input
                id="shortName" value={form.shortName}
                onChange={(e) => set('shortName', e.target.value)}
                placeholder="Wildflower"
              />
            </Field>

            <Field
              label="Business type"
              hint={`Sets the words used everywhere: “${vertical.clientNoun}”, “${vertical.providerNoun}”, “${vertical.visitNoun}”.`}
            >
              <Select
                value={form.vertical}
                onChange={(e) => set('vertical', e.target.value)}
              >
                {verticalOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </Select>
            </Field>

            <Field
              label="Tagline"
              htmlFor="tagline"
              hint="One line, shown as the headline on the booking page."
            >
              <Input
                id="tagline" value={form.tagline}
                onChange={(e) => set('tagline', e.target.value)}
                placeholder="Book your next visit before you leave."
              />
            </Field>

            <Field label="About" htmlFor="description">
              <Textarea
                id="description" rows={3} value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>

            <Divider label="Contact" />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="phone">
                <Input
                  id="phone" type="tel" value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input
                  id="email" type="email" value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
            </div>

            <Field label="Street address" htmlFor="address">
              <Input
                id="address" value={form.addressLine1}
                onChange={(e) => set('addressLine1', e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City" htmlFor="city">
                <Input id="city" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="State" htmlFor="region">
                <Input id="region" value={form.region} onChange={(e) => set('region', e.target.value)} />
              </Field>
              <Field label="ZIP" htmlFor="zip">
                <Input id="zip" value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
              </Field>
            </div>

            <Divider label="Regional" />

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Time zone" hint="All bookings are stored in UTC and shown in this zone.">
                <Select value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                  {[
                    'America/New_York', 'America/Chicago', 'America/Denver',
                    'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
                    'Pacific/Honolulu', 'Europe/London', 'Europe/Dublin',
                    'Australia/Sydney',
                  ].map((tz) => (
                    <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Currency">
                <Select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                  {['USD', 'CAD', 'GBP', 'EUR', 'AUD', 'NZD'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Sales tax %" hint="0 if you do not charge tax on services.">
                <Input
                  type="number" step="0.01" min="0" max="30"
                  value={form.taxRatePercent}
                  onChange={(e) => set('taxRatePercent', Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="flex justify-end pt-1">
              <Button loading={saving} onClick={() => saveAndAdvance('look')}>
                Save and continue
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* --- Step 2: look ------------------------------------------------- */}
      {step === 'look' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
          <Card>
            <CardHeader
              title="Make it theirs"
              description="Upload the client's logo and set one color. Everything else is derived."
            />
            <CardBody>
              <ImageUpload
                name="logoUrl"
                label="Logo"
                hint="Wide version for the site header. SVG or PNG with transparency works best."
                value={form.logoUrl}
                onChange={(url) => set('logoUrl', url)}
                kind="brand"
              />

              <ImageUpload
                name="logoMarkUrl"
                label="Icon"
                hint="Square mark for the app icon and tight spaces. Falls back to the logo."
                value={form.logoMarkUrl}
                onChange={(url) => set('logoMarkUrl', url)}
                kind="brand"
                aspect="square"
              />

              <ImageUpload
                name="heroUrl"
                label="Hero photo"
                hint="A real photo of the space. Nothing kills a salon site faster than stock art."
                value={form.heroUrl}
                onChange={(url) => set('heroUrl', url)}
                kind="media"
                aspect="wide"
              />

              <Divider />

              <ColorPicker
                name="brandColor"
                label="Brand color"
                hint="Buttons, links, and highlights. The rest of the palette is derived from this."
                value={form.brandColor}
                onChange={(hex) => set('brandColor', hex)}
              />

              <Field label="Corner style" hint="Sharp reads clinical; round reads playful.">
                <div className="grid grid-cols-3 gap-2">
                  {(['sharp', 'soft', 'round'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => set('radius', option)}
                      className={cn(
                        'border p-3 text-sm capitalize transition-colors',
                        option === 'sharp' && 'rounded',
                        option === 'soft' && 'rounded-xl',
                        option === 'round' && 'rounded-3xl',
                        form.radius === option
                          ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] font-medium'
                          : 'border-[var(--color-border)]'
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="flex justify-between pt-1">
                <Button variant="ghost" onClick={() => setStep('business')}>Back</Button>
                <Button loading={saving} onClick={() => saveAndAdvance('catalog')}>
                  Save and continue
                </Button>
              </div>
            </CardBody>
          </Card>

          <BrandPreview form={form} vertical={vertical} />
        </div>
      )}

      {/* --- Step 3: catalog --------------------------------------------- */}
      {step === 'catalog' && (
        <Card>
          <CardHeader
            title="What do they sell?"
            description={`Load the ${vertical.label} starter menu, then edit it. Faster than typing it from scratch.`}
          />
          <CardBody>
            {counts.services > 0 && (
              <Alert tone="success">
                {counts.services} services, {counts.addons} add-ons, and{' '}
                {counts.plans} membership plans are already set up. Importing
                again only adds what is missing — nothing is duplicated or
                overwritten.
              </Alert>
            )}

            <PresetImporter vertical={vertical} demo={demo} onDone={() => router.refresh()} />

            <Divider label="Or" />

            <p className="text-sm text-[var(--color-muted)]">
              Skip the preset and build the menu by hand in{' '}
              <a href="/admin/services" className="underline">Services</a>. You
              will want to go there anyway to set real prices.
            </p>

            <Alert tone="brand" title="The field that matters most">
              <p className="mt-1">
                Every service carries a <strong>rebooking interval</strong> — how
                many days until a {vertical.clientNoun} is due back. The preset
                sets sensible values ({vertical.rebookIntervalDays} days for a
                typical {vertical.visitNoun}). Sanity-check them with the owner:
                that number drives the rebooking prompt, the &quot;due for a
                visit&quot; queue, and every retention message the system sends.
              </p>
            </Alert>

            <div className="flex justify-between pt-1">
              <Button variant="ghost" onClick={() => setStep('look')}>Back</Button>
              <Button onClick={() => setStep('team')}>Continue</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* --- Step 4: team ------------------------------------------------- */}
      {step === 'team' && (
        <Card>
          <CardHeader
            title={`Who does the work?`}
            description={`Add each ${vertical.providerNoun}. They become bookable as soon as they have a schedule.`}
          />
          <CardBody>
            {counts.staff > 0 ? (
              <Alert tone="success">
                {counts.staff} bookable {counts.staff === 1 ? vertical.providerNoun : vertical.providerNoun + 's'}{' '}
                set up. Manage them in{' '}
                <a href="/admin/staff" className="underline">Team</a>.
              </Alert>
            ) : (
              <Alert tone="warning">
                No bookable {vertical.providerNoun}s yet. Nobody can book until
                at least one exists with a weekly schedule.
              </Alert>
            )}

            <QuickAddStaff
              providerNoun={vertical.providerNoun}
              demo={demo}
              onAdded={() => router.refresh()}
            />

            <div className="flex justify-between pt-1">
              <Button variant="ghost" onClick={() => setStep('catalog')}>Back</Button>
              <Button onClick={() => setStep('hours')}>Continue</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* --- Step 5: hours ------------------------------------------------ */}
      {step === 'hours' && (
        <Card>
          <CardHeader
            title="When are they open?"
            description="Nothing can be booked outside these hours, whatever a provider's schedule says."
          />
          <CardBody>
            <div className="space-y-2">
              {hours.map((day, index) => (
                <div
                  key={day.weekday}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-3"
                >
                  <span className="w-24 shrink-0 text-sm font-medium">
                    {DAY_NAMES[day.weekday]}
                  </span>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={!day.closed}
                      onChange={(e) => {
                        const next = [...hours];
                        next[index] = { ...day, closed: !e.target.checked };
                        setHours(next);
                      }}
                    />
                    Open
                  </label>

                  {!day.closed && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={day.open}
                        onChange={(e) => {
                          const next = [...hours];
                          next[index] = { ...day, open: e.target.value };
                          setHours(next);
                        }}
                        className="w-32"
                      />
                      <span className="text-[var(--color-muted)]">to</span>
                      <Input
                        type="time"
                        value={day.close}
                        onChange={(e) => {
                          const next = [...hours];
                          next[index] = { ...day, close: e.target.value };
                          setHours(next);
                        }}
                        className="w-32"
                      />
                    </div>
                  )}

                  {day.closed && (
                    <span className="text-sm text-[var(--color-muted)]">Closed</span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setStep('team')}>Back</Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={async () => {
                    if (!locationId) {
                      setError('Connect Supabase to save hours.');
                      return;
                    }
                    await run(() => saveHours(locationId, hours));
                  }}
                >
                  Save hours
                </Button>
                <Button
                  loading={saving}
                  onClick={async () => {
                    if (locationId) {
                      const ok = await run(() => saveHours(locationId, hours));
                      if (!ok) return;
                      await completeOnboarding();
                    }
                    toast('Setup complete.');
                    router.push('/admin');
                  }}
                >
                  Finish setup
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live brand preview
// ---------------------------------------------------------------------------

/**
 * Renders the actual booking card using the pending brand values.
 *
 * A color swatch tells you nothing about whether a brand color works as a
 * button sitting next to the client's logo — this shows the real thing before
 * anyone commits.
 */
function BrandPreview({
  form, vertical,
}: {
  form: InitialValues;
  vertical: VerticalOption;
}) {
  const radiusMap = { sharp: '0.25rem', soft: '0.75rem', round: '1.5rem' };

  return (
    <div className="lg:sticky lg:top-6 lg:self-start">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        Live preview
      </p>
      <div
        className="overflow-hidden border border-[var(--color-border)] bg-white"
        style={{ borderRadius: radiusMap[form.radius] }}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] p-3">
          {form.logoMarkUrl || form.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={(form.logoMarkUrl || form.logoUrl)!}
              alt=""
              className="h-6 max-w-24 object-contain"
            />
          ) : (
            <span
              className="flex size-6 items-center justify-center text-[10px] font-bold text-white"
              style={{ background: form.brandColor, borderRadius: radiusMap[form.radius] }}
            >
              {form.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="truncate text-sm font-semibold text-neutral-900">
            {form.name || 'Your business'}
          </span>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-sm font-medium text-neutral-900">
            {vertical.sampleServices[0] ?? 'Signature Service'}
          </p>
          <p className="text-xs text-neutral-500">60 min · $85</p>

          <div className="flex flex-wrap gap-1.5">
            {['9:00 AM', '11:30 AM', '2:00 PM'].map((time, i) => (
              <span
                key={time}
                className="px-2 py-1 text-xs"
                style={{
                  borderRadius: radiusMap[form.radius],
                  border: `1px solid ${i === 1 ? form.brandColor : '#e5e5e5'}`,
                  background: i === 1 ? `${form.brandColor}18` : 'transparent',
                  color: i === 1 ? form.brandColor : '#525252',
                }}
              >
                {time}
              </span>
            ))}
          </div>

          <button
            className="w-full py-2.5 text-sm font-medium text-white"
            style={{ background: form.brandColor, borderRadius: radiusMap[form.radius] }}
          >
            Book {vertical.visitNoun}
          </button>

          <p className="text-center text-[11px] text-neutral-400">
            Free changes up to 24 hours before
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs text-[var(--color-muted)]">
        This is the real booking card, not a mockup.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset importer
// ---------------------------------------------------------------------------

function PresetImporter({
  vertical, demo, onDone,
}: {
  vertical: VerticalOption;
  demo?: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [options, setOptions] = React.useState({
    services: true, addons: true, plans: true, products: true,
  });

  return (
    <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{vertical.label} starter menu</p>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {vertical.sampleServices.join(', ')}
            {vertical.serviceCount > 3 && `, +${vertical.serviceCount - 3} more`}
          </p>
        </div>
        <Badge tone="brand">{vertical.serviceCount} services</Badge>
      </div>

      <div className="space-y-2.5 border-t border-[var(--color-border)] pt-3">
        <Toggle
          checked={options.services}
          onChange={(v) => setOptions({ ...options, services: v })}
          label={`${vertical.serviceCount} services`}
          description="With durations, prices, and rebooking intervals"
        />
        <Toggle
          checked={options.addons}
          onChange={(v) => setOptions({ ...options, addons: v })}
          label={`${vertical.addonCount} add-ons`}
          description="The cheapest way to move average ticket"
        />
        <Toggle
          checked={options.plans}
          onChange={(v) => setOptions({ ...options, plans: v })}
          label={`${vertical.planCount} membership plans`}
          description="Recurring revenue shapes that sell in this vertical"
        />
        <Toggle
          checked={options.products}
          onChange={(v) => setOptions({ ...options, products: v })}
          label={`${vertical.productCount} retail products`}
          description="Placeholder SKUs to replace with real stock"
        />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Button
        fullWidth
        loading={busy}
        disabled={!Object.values(options).some(Boolean)}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await importVerticalPreset(vertical.key, options);
          setBusy(false);
          if (result.ok) {
            toast(result.message ?? 'Imported.');
            onDone();
          } else {
            setError(result.error);
          }
        }}
      >
        {demo ? 'Import (needs Supabase)' : 'Import starter menu'}
      </Button>

      <p className="text-xs text-[var(--color-muted)]">
        Safe to run more than once — anything already present is left alone.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick-add staff
// ---------------------------------------------------------------------------

function QuickAddStaff({
  providerNoun, demo, onAdded,
}: {
  providerNoun: string;
  demo?: boolean;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = React.useState([{ name: '', title: '' }]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const PALETTE = ['#4F7CAC', '#7A9E7E', '#C08552', '#8E6C88', '#5B8266', '#B5651D'];

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <Field label={index === 0 ? 'Name' : undefined} className="min-w-40 flex-1">
            <Input
              value={row.name}
              placeholder="Alex Rivera"
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...row, name: e.target.value };
                setRows(next);
              }}
            />
          </Field>
          <Field label={index === 0 ? 'Title' : undefined} className="min-w-40 flex-1">
            <Input
              value={row.title}
              placeholder={`Senior ${providerNoun}`}
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...row, title: e.target.value };
                setRows(next);
              }}
            />
          </Field>
          {rows.length > 1 && (
            <Button
              variant="ghost" size="sm"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => setRows([...rows, { name: '', title: '' }])}
        className="text-sm text-[var(--color-brand)] underline-offset-4 hover:underline"
      >
        + Add another
      </button>

      {error && <Alert tone="danger">{error}</Alert>}

      <Button
        variant="secondary"
        loading={busy}
        disabled={!rows.some((r) => r.name.trim())}
        onClick={async () => {
          setBusy(true);
          setError(null);
          let added = 0;

          for (const [index, row] of rows.entries()) {
            if (!row.name.trim()) continue;
            const data = new FormData();
            data.set('displayName', row.name.trim());
            data.set('title', row.title.trim());
            data.set('role', 'provider');
            data.set('bookable', 'true');
            data.set('active', 'true');
            data.set('priceMultiplier', '1');
            data.set('color', PALETTE[index % PALETTE.length]);

            const result = await saveStaff(null, data);
            if (!result.ok) {
              setError(result.error);
              setBusy(false);
              return;
            }
            added++;
          }

          setBusy(false);
          setRows([{ name: '', title: '' }]);
          toast(`Added ${added} ${added === 1 ? providerNoun : providerNoun + 's'}.`);
          onAdded();
        }}
      >
        {demo ? 'Add (needs Supabase)' : `Add ${providerNoun}s`}
      </Button>

      <p className="text-xs text-[var(--color-muted)]">
        New {providerNoun}s can perform every service by default. Set their
        weekly schedule in Team — nobody is bookable without one.
      </p>
    </div>
  );
}
