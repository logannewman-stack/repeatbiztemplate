'use client';

/**
 * ============================================================================
 * INTERACTIVE PRIMITIVES
 * ============================================================================
 * The pieces that need state or browser APIs. Kept separate from
 * `components/ui/index.tsx` so server components can import the static
 * primitives without dragging a client boundary along with them.
 * ============================================================================
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button, Spinner, Field } from '@/components/ui';

// --- Modal ------------------------------------------------------------------

/**
 * Built on `<dialog>` so focus trapping, Escape, and inertness of the page
 * behind come from the platform rather than from hand-rolled key handlers.
 */
export function Modal({
  open, onClose, title, description, children, footer, size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Clicking the backdrop closes. The dialog element reports backdrop
        // clicks as clicks on itself, so compare the target.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-[var(--color-border)]',
        'bg-[var(--color-surface)] p-0 text-[var(--color-fg)] shadow-xl',
        'backdrop:bg-black/40 backdrop:backdrop-blur-sm',
        widths[size]
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-5">
            <div className="min-w-0">
              <h2 className="font-semibold">{title}</h2>
              {description && (
                <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-1 shrink-0 rounded-lg p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
            >
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border)] p-4">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

/** Destructive confirmation. Never wire a delete straight to a click. */
export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted)]">{message}</p>
    </Modal>
  );
}

// --- Toast ------------------------------------------------------------------

interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

const ToastContext = React.createContext<{
  toast: (text: string, tone?: 'success' | 'error') => void;
}>({ toast: () => {} });

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setMessages((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'pointer-events-auto max-w-sm rounded-[var(--radius-card)] px-4 py-3 text-sm shadow-lg',
              message.tone === 'error'
                ? 'bg-[var(--color-danger)] text-white'
                : 'bg-[var(--color-fg)] text-[var(--color-bg)]'
            )}
          >
            {message.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// --- Image upload -----------------------------------------------------------

/**
 * Drop-or-browse uploader that posts to /api/upload and hands back a public
 * URL. Keeps the current value in a hidden input so it submits with the
 * surrounding form like any other field.
 */
export function ImageUpload({
  name, value, onChange, label, hint, kind = 'brand', aspect = 'auto', accept,
}: {
  name: string;
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  hint?: string;
  kind?: 'brand' | 'media' | 'client';
  aspect?: 'auto' | 'square' | 'wide';
  accept?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('kind', kind);

      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  const ratios = {
    auto: 'min-h-28',
    square: 'aspect-square',
    wide: 'aspect-[16/9]',
  };

  return (
    <Field label={label} hint={hint} error={error}>
      <input type="hidden" name={name} value={value ?? ''} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-[var(--radius-card)] border-2 border-dashed p-3 transition-colors',
          ratios[aspect],
          dragging
            ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface-2)]'
        )}
      >
        {busy ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Spinner /> Uploading…
          </div>
        ) : value ? (
          <div className="flex w-full flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="max-h-28 max-w-full object-contain"
            />
            <div className="flex gap-2">
              <Button
                type="button" size="xs" variant="secondary"
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </Button>
              <Button
                type="button" size="xs" variant="ghost"
                onClick={() => onChange(null)}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-1 py-4 text-sm text-[var(--color-muted)]"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
            </svg>
            <span className="font-medium text-[var(--color-fg)]">Upload an image</span>
            <span className="text-xs">or drag one here</span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept ?? 'image/png,image/jpeg,image/webp,image/svg+xml,image/avif'}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = '';
          }}
        />
      </div>
    </Field>
  );
}

// --- Color picker -----------------------------------------------------------

/**
 * Hex in, hex out. The app stores OKLCH, but nobody's brand guide is written
 * in OKLCH — conversion happens on save, not in front of the operator.
 */
export function ColorPicker({
  name, value, onChange, label, hint, presets,
}: {
  name: string;
  value: string;
  onChange: (hex: string) => void;
  label: string;
  hint?: string;
  presets?: string[];
}) {
  const swatches = presets ?? [
    '#4F7CAC', '#2D6A4F', '#7A4E7E', '#C0552F',
    '#1F2933', '#B08968', '#3A5A98', '#8C2F39',
  ];

  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <label className="relative shrink-0 cursor-pointer">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="sr-only"
            aria-label={label}
          />
          <span
            aria-hidden
            className="block size-11 rounded-[var(--radius-card)] border border-[var(--color-border)]"
            style={{ background: value }}
          />
        </label>

        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={cn(
            'h-11 w-28 rounded-[var(--radius-card)] border border-[var(--color-border)]',
            'bg-[var(--color-surface)] px-3 font-mono text-sm uppercase'
          )}
        />

        <div className="flex flex-wrap gap-1.5">
          {swatches.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              aria-label={`Use ${hex}`}
              className={cn(
                'size-7 rounded-full border transition-transform hover:scale-110',
                value.toLowerCase() === hex.toLowerCase()
                  ? 'border-[var(--color-fg)] ring-2 ring-[var(--color-fg)] ring-offset-2 ring-offset-[var(--color-surface)]'
                  : 'border-black/10'
              )}
              style={{ background: hex }}
            />
          ))}
        </div>
      </div>
    </Field>
  );
}

// --- Tabs -------------------------------------------------------------------

export function Tabs({
  tabs, active, onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="scroll-x border-b border-[var(--color-border)]" role="tablist">
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative whitespace-nowrap px-3 py-2.5 text-sm transition-colors',
              active === tab.id
                ? 'font-medium text-[var(--color-fg)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-fg)]'
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className="ml-1.5 text-xs text-[var(--color-muted)]">{tab.count}</span>
            )}
            {active === tab.id && (
              <span
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--color-brand)]"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
