import { brand } from '@/config/brand';
import { Card, Button, Alert } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { isStripeConfigured } from '@/lib/stripe/client';
import { Screen } from '@/components/app';

export const metadata = {
  title: 'Gift cards',
  description: `Buy a gift card for ${brand.name}.`,
};

const AMOUNTS = [5000, 10000, 15000, 25000];

export default function GiftCardsPage() {
  const canSell = isStripeConfigured();

  return (
    <>
      <Screen
        title={'Gift cards'}
        subtitle="Redeemable against any service or product. They never expire."
      ><div className="px-4">

        {!canSell && (
          <Alert tone="warning" title="Payments not configured">
            Gift card sales need Stripe. Add <code>STRIPE_SECRET_KEY</code> to
            enable this page — see <code>SETUP.md</code>.
          </Alert>
        )}

        <Card className="mt-8 p-6">
          <fieldset>
            <legend className="font-medium">Choose an amount</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AMOUNTS.map((amount) => (
                <label
                  key={amount}
                  className="cursor-pointer rounded-[var(--radius-card)] border border-[var(--color-border)] p-4 text-center transition-colors has-[:checked]:border-[var(--color-brand)] has-[:checked]:bg-[var(--color-brand-soft)]"
                >
                  <input type="radio" name="amount" value={amount} className="sr-only" />
                  <span className="font-semibold tabular-nums">{formatMoney(amount)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button className="mt-6" fullWidth size="lg" disabled={!canSell}>
            Continue to payment
          </Button>

          <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
            Delivered by email. Choose a delivery date at checkout.
          </p>
        </Card>
      </div></Screen>
    </>
  );
}
