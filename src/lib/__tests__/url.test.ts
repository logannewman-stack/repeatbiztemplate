import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { resolveAppUrl, appUrl, hasPublicAppUrl, __test } from '@/lib/url';

const { toOrigin } = __test;

const VARS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'NEXT_PUBLIC_VERCEL_URL',
  'VERCEL_URL',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
});

afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('toOrigin', () => {
  it('accepts a well-formed URL', () => {
    expect(toOrigin('https://example.com')).toBe('https://example.com');
  });

  it('assumes https for a bare host — the most common hand-entered form', () => {
    expect(toOrigin('example.vercel.app')).toBe('https://example.vercel.app');
  });

  it('strips trailing slashes so joins do not double up', () => {
    expect(toOrigin('https://example.com/')).toBe('https://example.com');
    expect(toOrigin('https://example.com///')).toBe('https://example.com');
  });

  it('tolerates pasted whitespace', () => {
    expect(toOrigin('  https://example.com  ')).toBe('https://example.com');
  });

  it('drops a path, keeping only the origin', () => {
    expect(toOrigin('https://example.com/book?x=1')).toBe('https://example.com');
  });

  it('keeps a non-default port', () => {
    expect(toOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  // These are the inputs that used to fail the production build.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['a bare scheme', 'https://'],
  ])('returns null for %s instead of throwing', (_label, input) => {
    expect(() => toOrigin(input as string | undefined)).not.toThrow();
    expect(toOrigin(input as string | undefined)).toBeNull();
  });

  it('rejects a non-http protocol', () => {
    expect(toOrigin('ftp://example.com')).toBeNull();
    expect(toOrigin('javascript:alert(1)')).toBeNull();
  });
});

describe('resolveAppUrl', () => {
  it('falls back to localhost when nothing is set', () => {
    expect(resolveAppUrl()).toBe('http://localhost:3000');
  });

  it('never throws on the values that broke the build', () => {
    for (const bad of ['', '   ', 'https://', 'not a url']) {
      process.env.NEXT_PUBLIC_APP_URL = bad;
      expect(() => resolveAppUrl()).not.toThrow();
      expect(() => new URL(resolveAppUrl())).not.toThrow();
    }
  });

  it('repairs a protocol-less value rather than discarding it', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'shop.example.com';
    expect(resolveAppUrl()).toBe('https://shop.example.com');
  });

  it('prefers the explicit setting over Vercel system vars', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://booking.example.com';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'proj.vercel.app';
    process.env.VERCEL_URL = 'dpl-abc123.vercel.app';
    expect(resolveAppUrl()).toBe('https://booking.example.com');
  });

  it('skips a malformed explicit setting and uses the next candidate', () => {
    process.env.NEXT_PUBLIC_APP_URL = '';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'proj.vercel.app';
    expect(resolveAppUrl()).toBe('https://proj.vercel.app');
  });

  it('prefers the stable production domain over the per-deployment URL', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'proj.vercel.app';
    process.env.VERCEL_URL = 'dpl-abc123.vercel.app';
    expect(resolveAppUrl()).toBe('https://proj.vercel.app');
  });

  it('deploys with working links on Vercel with nothing configured', () => {
    process.env.VERCEL_URL = 'dpl-abc123.vercel.app';
    expect(resolveAppUrl()).toBe('https://dpl-abc123.vercel.app');
  });
});

describe('appUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
  });

  it('joins a path', () => {
    expect(appUrl('/book')).toBe('https://example.com/book');
  });

  it('tolerates a missing leading slash', () => {
    expect(appUrl('book')).toBe('https://example.com/book');
  });

  it('returns the bare origin for no path', () => {
    expect(appUrl()).toBe('https://example.com');
  });

  it('produces a URL Stripe will accept', () => {
    expect(() => new URL(appUrl('/account/membership?welcome=1'))).not.toThrow();
  });
});

describe('hasPublicAppUrl', () => {
  it('is false on the localhost fallback', () => {
    expect(hasPublicAppUrl()).toBe(false);
  });

  it('is true once a real origin resolves', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
    expect(hasPublicAppUrl()).toBe(true);
  });
});
