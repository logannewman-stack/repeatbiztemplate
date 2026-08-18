import { describe, it, expect } from 'vitest';
import { hexToOklch, oklchToHex, derivePalette, resolveBrand } from '@/lib/brand';
import { brand as configBrand } from '@/config/brand';

describe('hex ↔ oklch', () => {
  it('round-trips common brand colors within one step of 8-bit precision', () => {
    const colors = [
      '#4F7CAC', '#7A9E7E', '#C08552', '#000000', '#FFFFFF',
      '#FF0000', '#00FF00', '#0000FF', '#1a1d21', '#E8DDD3',
    ];

    for (const hex of colors) {
      const back = oklchToHex(hexToOklch(hex));
      const [r1, g1, b1] = channels(hex);
      const [r2, g2, b2] = channels(back);

      // Two float conversions through cube roots will not land exactly.
      expect(Math.abs(r1 - r2), `${hex} red`).toBeLessThanOrEqual(1);
      expect(Math.abs(g1 - g2), `${hex} green`).toBeLessThanOrEqual(1);
      expect(Math.abs(b1 - b2), `${hex} blue`).toBeLessThanOrEqual(1);
    }
  });

  it('places black and white at the lightness extremes', () => {
    expect(hexToOklch('#000000')).toMatch(/^oklch\(0\.000/);
    expect(hexToOklch('#FFFFFF')).toMatch(/^oklch\(1\.000/);
  });

  it('gives greys near-zero chroma', () => {
    const grey = hexToOklch('#808080');
    const chroma = Number(grey.match(/oklch\([\d.]+ ([\d.]+)/)![1]);
    expect(chroma).toBeLessThan(0.01);
  });

  it('accepts 3-digit hex and a missing #', () => {
    expect(oklchToHex(hexToOklch('#f00'))).toBe(oklchToHex(hexToOklch('#ff0000')));
    expect(hexToOklch('4F7CAC')).toBe(hexToOklch('#4F7CAC'));
  });

  it('does not throw on garbage input', () => {
    expect(hexToOklch('not a color')).toBe('oklch(0.5 0 0)');
    expect(oklchToHex('nonsense')).toBe('#000000');
  });
});

describe('derivePalette', () => {
  it('builds a full palette from one color', () => {
    const palette = derivePalette('#4F7CAC');
    for (const key of Object.keys(configBrand.colors)) {
      expect(palette[key as keyof typeof palette], key).toBeTruthy();
    }
  });

  it('puts light text on a dark brand color and dark text on a light one', () => {
    expect(derivePalette('#10243A').brandForeground).toContain('0.99');
    expect(derivePalette('#F2E7D5').brandForeground).toContain('0.20');
  });

  it('keeps semantic colors at their conventional hues', () => {
    // A "success" green dragged toward a red brand hue stops reading as success.
    const palette = derivePalette('#CC0000');
    expect(palette.success).toContain('155');
    expect(palette.danger).toContain('25');
  });

  it('places the accent away from the brand hue', () => {
    const palette = derivePalette('#4F7CAC');
    const brandHue = Number(palette.brand.match(/oklch\([\d.]+ [\d.]+ ([\d.]+)/)![1]);
    const accentHue = Number(palette.accent.match(/oklch\([\d.]+ [\d.]+ ([\d.]+)/)![1]);
    const separation = Math.min(
      Math.abs(brandHue - accentHue),
      360 - Math.abs(brandHue - accentHue)
    );
    expect(separation).toBeGreaterThan(90);
  });
});

describe('resolveBrand', () => {
  it('returns the compiled config when nothing is stored', () => {
    expect(resolveBrand(null).name).toBe(configBrand.name);
    expect(resolveBrand(undefined).name).toBe(configBrand.name);
  });

  it('merges stored overrides over the config', () => {
    const resolved = resolveBrand({ name: 'Wildflower Hair', tagline: 'Custom' });
    expect(resolved.name).toBe('Wildflower Hair');
    expect(resolved.tagline).toBe('Custom');
    // Untouched keys survive.
    expect(resolved.colors.brand).toBe(configBrand.colors.brand);
  });

  it('merges nested objects rather than replacing them wholesale', () => {
    const resolved = resolveBrand({ colors: { brand: 'oklch(0.6 0.2 30)' } });
    expect(resolved.colors.brand).toBe('oklch(0.6 0.2 30)');
    // A partial colors override must not wipe out the rest of the palette.
    expect(resolved.colors.success).toBe(configBrand.colors.success);
    expect(resolved.colors.border).toBe(configBrand.colors.border);
  });

  it('ignores a stored array or scalar', () => {
    expect(resolveBrand(['nope'] as never).name).toBe(configBrand.name);
    expect(resolveBrand('nope' as never).name).toBe(configBrand.name);
  });
});

function channels(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}
