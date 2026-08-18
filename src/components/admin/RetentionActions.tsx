'use client';

import * as React from 'react';
import { Button } from '@/components/ui';

/**
 * Row actions on the retention queue. Deliberately just two: call, or send the
 * nudge. A longer menu slows down a list that is meant to be worked fast.
 */
export function RetentionActions({
  clientId, phone, lifecycle,
}: {
  clientId: string;
  phone: string | null;
  lifecycle: string;
}) {
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function sendNudge() {
    setState('sending');
    try {
      const res = await fetch('/api/retention/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, lifecycle }),
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="flex justify-end gap-1.5">
      {phone && (
        <a href={`tel:${phone.replace(/\D/g, '')}`}>
          <Button size="sm" variant="secondary">Call</Button>
        </a>
      )}
      <Button
        size="sm"
        variant={state === 'sent' ? 'ghost' : 'primary'}
        loading={state === 'sending'}
        disabled={state === 'sent'}
        onClick={sendNudge}
      >
        {state === 'sent' ? 'Sent' : state === 'error' ? 'Retry' : 'Nudge'}
      </Button>
    </div>
  );
}
