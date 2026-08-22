/**
 * The default matters more than the flag. Backwards, either a prospect sees
 * "Demo mode — see SETUP.md" mid-pitch, or a developer clones the repo and
 * cannot tell it is unconfigured.
 */

import { describe, it, expect } from 'vitest';
import { isSetupMode, isPresentationMode, isSalesDemo } from '../setup-mode';

describe('isSetupMode', () => {
  it('is on in development, so a fresh clone says it is unconfigured', () => {
    expect(isSetupMode({ NODE_ENV: 'development' })).toBe(true);
  });

  it('is off in a production build, which is what a prospect is shown', () => {
    expect(isSetupMode({ NODE_ENV: 'production' })).toBe(false);
    expect(isPresentationMode({ NODE_ENV: 'production' })).toBe(true);
  });

  it('turns on for a deployment while a real client is being configured', () => {
    expect(isSetupMode({ NODE_ENV: 'production', NEXT_PUBLIC_SETUP_HINTS: '1' })).toBe(true);
  });

  it('accepts any truthy string, because env vars are typed by hand', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) {
      expect(isSetupMode({ NODE_ENV: 'production', NEXT_PUBLIC_SETUP_HINTS: v })).toBe(true);
    }
  });

  it('turns off explicitly in development, for rehearsing a demo locally', () => {
    for (const v of ['0', 'false', 'False']) {
      expect(isSetupMode({ NODE_ENV: 'development', NEXT_PUBLIC_SETUP_HINTS: v })).toBe(false);
    }
  });

  it('treats an empty string as unset, not as false', () => {
    // Hosting dashboards hand back "" for a variable nobody filled in.
    expect(isSetupMode({ NODE_ENV: 'development', NEXT_PUBLIC_SETUP_HINTS: '' })).toBe(true);
    expect(isSetupMode({ NODE_ENV: 'production', NEXT_PUBLIC_SETUP_HINTS: '' })).toBe(false);
  });

  it('is off when the environment says nothing at all', () => {
    expect(isSetupMode({})).toBe(false);
  });

  it('is always the inverse of presentation mode', () => {
    for (const env of [
      { NODE_ENV: 'development' },
      { NODE_ENV: 'production', NEXT_PUBLIC_SETUP_HINTS: '1' },
      { NODE_ENV: 'development', NEXT_PUBLIC_SETUP_HINTS: '0' },
      {},
    ]) {
      expect(isSetupMode(env)).toBe(!isPresentationMode(env));
    }
  });
});

describe('isSalesDemo', () => {
  const dev = { NODE_ENV: 'development' };
  const prod = { NODE_ENV: 'production' };

  it('is the state a prospect is shown: no database, hints off', () => {
    expect(isSalesDemo(false, prod)).toBe(true);
  });

  it('is not a developer running the thing locally', () => {
    // They are also in demo mode, and they want every hint going.
    expect(isSalesDemo(false, dev)).toBe(false);
  });

  it('is not a real client deployment', () => {
    expect(isSalesDemo(true, prod)).toBe(false);
    expect(isSalesDemo(true, dev)).toBe(false);
  });

  it('turns off when hints are forced on for a build being configured', () => {
    expect(isSalesDemo(false, { ...prod, NEXT_PUBLIC_SETUP_HINTS: '1' })).toBe(false);
  });
});
