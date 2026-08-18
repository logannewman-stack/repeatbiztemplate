import { describe, it, expect } from 'vitest';
import { quote, decideDeposit, membershipSavingsPitch } from '@/lib/booking/pricing';
import type { PriceableService, MemberContext, ClientRiskContext } from '@/lib/booking/pricing';
import { rules as baseRules } from '@/config/rules';

const SERVICE: PriceableService = {
  id: 'svc', name: 'Service A', price_cents: 10000, member_price_cents: null,
  duration_min: 60, deposit_mode: 'none', deposit_flat_cents: 0,
  deposit_percent: 0, taxable: true,
};

const CLEAN_CLIENT: ClientRiskContext = {
  isNewClient: false, noShowRisk: 10, noShowCount: 0,
  lateCancelCount: 0, hasCardOnFile: true,
};

const MEMBER: MemberContext = {
  discountPct: 15, retailDiscountPct: 15, waivesDeposits: true,
  creditsAvailable: 2, creditCoversService: true,
};

describe('quote', () => {
  it('prices a plain service with tax', () => {
    const q = quote({
      service: SERVICE, addons: [], member: null, client: CLEAN_CLIENT,
      rules: baseRules, taxRateBps: 700,
    });
    expect(q.subtotalCents).toBe(10000);
    expect(q.taxCents).toBe(700);
    expect(q.totalCents).toBe(10700);
    expect(q.memberSavingsCents).toBe(0);
  });

  it('applies the member percentage and reports savings', () => {
    const q = quote({
      service: SERVICE, addons: [], member: MEMBER, client: CLEAN_CLIENT,
      rules: baseRules, taxRateBps: 0,
    });
    expect(q.subtotalCents).toBe(8500);
    expect(q.memberSavingsCents).toBe(1500);
  });

  it('prefers an explicit member price over the plan percentage', () => {
    const q = quote({
      service: { ...SERVICE, member_price_cents: 7000 },
      addons: [], member: MEMBER, client: CLEAN_CLIENT,
      rules: baseRules, taxRateBps: 0,
    });
    expect(q.subtotalCents).toBe(7000);
    expect(q.memberSavingsCents).toBe(3000);
  });

  it('zeroes the service when a membership credit covers it', () => {
    const q = quote({
      service: SERVICE, addons: [], member: MEMBER, client: CLEAN_CLIENT,
      rules: baseRules, taxRateBps: 700, useMembershipCredit: true,
    });
    expect(q.coveredByCredit).toBe(true);
    expect(q.subtotalCents).toBe(0);
    expect(q.totalCents).toBe(0);
    expect(q.memberSavingsCents).toBe(10000);
    expect(q.deposit.required).toBe(false);
  });

  it('still charges for add-ons when a credit covers the service', () => {
    const q = quote({
      service: SERVICE,
      addons: [{
        id: 'a1', name: 'Add-On One', price_cents: 2500,
        member_price_cents: null, duration_min: 15, taxable: true, fromUpsell: true,
      }],
      member: MEMBER, client: CLEAN_CLIENT, rules: baseRules,
      taxRateBps: 0, useMembershipCredit: true,
    });
    expect(q.subtotalCents).toBe(2125);       // 2500 less 15%
    expect(q.durationMin).toBe(75);
    expect(q.lines.find((l) => l.kind === 'addon')?.fromUpsell).toBe(true);
  });

  it('adds add-on duration to the appointment length', () => {
    const q = quote({
      service: SERVICE,
      addons: [
        { id: 'a1', name: 'One', price_cents: 2500, member_price_cents: null, duration_min: 15, taxable: true },
        { id: 'a2', name: 'Two', price_cents: 3500, member_price_cents: null, duration_min: 20, taxable: true },
      ],
      member: null, client: CLEAN_CLIENT, rules: baseRules, taxRateBps: 0,
    });
    expect(q.durationMin).toBe(95);
    expect(q.subtotalCents).toBe(16000);
  });

  it('applies a percent offer before tax', () => {
    const q = quote({
      service: SERVICE, addons: [], member: null, client: CLEAN_CLIENT,
      rules: baseRules, taxRateBps: 1000,
      offer: { kind: 'percent', value: 20, label: '20% off' },
    });
    expect(q.discountCents).toBe(2000);
    expect(q.subtotalCents).toBe(8000);
    expect(q.taxCents).toBe(800);
    expect(q.totalCents).toBe(8800);
  });

  it('never lets a flat offer push the total negative', () => {
    const q = quote({
      service: { ...SERVICE, price_cents: 1000 },
      addons: [], member: null, client: CLEAN_CLIENT, rules: baseRules,
      taxRateBps: 0, offer: { kind: 'flat', value: 5000, label: '$50 off' },
    });
    expect(q.totalCents).toBe(0);
    expect(q.subtotalCents).toBe(0);
  });

  it('adds a tip on top of tax', () => {
    const q = quote({
      service: SERVICE, addons: [], member: null, client: CLEAN_CLIENT,
      rules: baseRules, taxRateBps: 0, tipCents: 2000,
    });
    expect(q.totalCents).toBe(12000);
    expect(q.lines.some((l) => l.kind === 'tip')).toBe(true);
  });

  it('discounts retail at the retail member rate', () => {
    const q = quote({
      service: SERVICE, addons: [], member: MEMBER, client: CLEAN_CLIENT,
      rules: baseRules, taxRateBps: 0,
      products: [{
        id: 'p1', name: 'Retail A', price_cents: 2800,
        member_price_cents: null, quantity: 2, taxable: true,
      }],
    });
    // 8500 service + 2 x 2380 retail
    expect(q.subtotalCents).toBe(8500 + 4760);
  });
});

describe('decideDeposit', () => {
  const r = baseRules;

  it('takes nothing from a known good client on a cheap service', () => {
    const d = decideDeposit(
      { ...SERVICE, price_cents: 5000, duration_min: 30 }, 5000, r, CLEAN_CLIENT, null
    );
    expect(d.required).toBe(false);
  });

  it('honors a service-level deposit policy', () => {
    const d = decideDeposit(
      { ...SERVICE, deposit_mode: 'percent', deposit_percent: 25 },
      10000, r, CLEAN_CLIENT, null
    );
    expect(d.required).toBe(true);
    expect(d.amountCents).toBe(2500);
    expect(d.trigger).toBe('service_policy');
  });

  it('requires a deposit above the high-value threshold', () => {
    const d = decideDeposit(SERVICE, 20000, r, CLEAN_CLIENT, null);
    expect(d.required).toBe(true);
    expect(d.trigger).toBe('high_value');
  });

  it('requires a deposit from new clients', () => {
    const d = decideDeposit(
      { ...SERVICE, price_cents: 5000, duration_min: 30 }, 5000, r,
      { ...CLEAN_CLIENT, isNewClient: true }, null
    );
    expect(d.required).toBe(true);
    expect(d.trigger).toBe('new_client');
  });

  it('forces full prepay after repeat no-shows, and says why', () => {
    const d = decideDeposit(SERVICE, 10000, r, {
      ...CLEAN_CLIENT, noShowCount: 2,
    }, null);
    expect(d.required).toBe(true);
    expect(d.amountCents).toBe(10000);
    expect(d.trigger).toBe('repeat_no_show');
    expect(d.reason).toContain('2 missed appointments');
  });

  it('waives deposits for members', () => {
    const d = decideDeposit(SERVICE, 20000, r, CLEAN_CLIENT, MEMBER);
    expect(d.required).toBe(false);
  });

  it('does not waive full prepay for a member with repeat no-shows', () => {
    const d = decideDeposit(SERVICE, 10000, r, {
      ...CLEAN_CLIENT, noShowCount: 3,
    }, MEMBER);
    expect(d.required).toBe(true);
    expect(d.trigger).toBe('repeat_no_show');
  });

  it('requires a deposit above the risk threshold', () => {
    const d = decideDeposit(
      { ...SERVICE, price_cents: 5000, duration_min: 30 }, 5000, r,
      { ...CLEAN_CLIENT, noShowRisk: 75 }, null
    );
    expect(d.required).toBe(true);
    expect(d.trigger).toBe('risk_score');
  });
});

describe('membershipSavingsPitch', () => {
  const plan = {
    name: 'Essential', price_cents: 9900, included_credits: 1,
    discount_pct: 10, billing_interval: 'month',
  };

  it('pitches when the client already outspends the plan', () => {
    const pitch = membershipSavingsPitch({
      spendLookbackDays: 90, spendInPeriodCents: 60000, visitsInPeriod: 6, plan,
    });
    expect(pitch).not.toBeNull();
    expect(pitch!.savingsCents).toBeGreaterThan(0);
    expect(pitch!.periodMonths).toBe(3);
  });

  it('stays quiet when the plan would cost the client more', () => {
    const pitch = membershipSavingsPitch({
      spendLookbackDays: 90, spendInPeriodCents: 10000, visitsInPeriod: 1, plan,
    });
    expect(pitch).toBeNull();
  });

  it('handles a client with no visits without dividing by zero', () => {
    const pitch = membershipSavingsPitch({
      spendLookbackDays: 90, spendInPeriodCents: 0, visitsInPeriod: 0, plan,
    });
    expect(pitch).toBeNull();
  });
});
