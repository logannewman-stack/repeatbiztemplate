#!/usr/bin/env node
/**
 * ============================================================================
 * APP ICON GENERATION
 * ============================================================================
 *     npm run icons
 *
 * Rasterises public/brand/icon-512.svg into the PNGs a home-screen install
 * actually needs. Run it after replacing the SVG with a client's mark.
 *
 * Why PNG at all, when the SVG is right there: iOS does not accept SVG for
 * apple-touch-icon or for manifest icons. Ship only SVG and the home screen
 * gets a grey generic tile with a screenshot of the page in it.
 *
 * Three shapes, because the platforms mask differently:
 *
 *   apple-touch-icon  square, full-bleed, NO transparency. iOS applies its own
 *                     squircle. Rounded corners here get rounded twice, and
 *                     transparent ones turn black.
 *   any               the icon as drawn, used as-is on desktop and in tabs.
 *   maskable          Android crops to an arbitrary shape. Only the centre 80%
 *                     is guaranteed visible, so the mark is inset to survive it.
 * ============================================================================
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const SOURCE = join(root, 'public/brand/icon-512.svg');
const OUT = join(root, 'public/icons');

const svg = readFileSync(SOURCE);

// The background colour has to match the artwork exactly or the flattened
// apple-touch-icon shows a seam where the rounded corner used to be.
const background =
  svg.toString().match(/<rect[^>]*fill="(#[0-9a-fA-F]{3,8})"/)?.[1] ?? '#ffffff';

mkdirSync(OUT, { recursive: true });

const targets = [
  { file: 'apple-touch-icon.png', size: 180, flatten: true, inset: 0 },
  { file: 'icon-192.png', size: 192, flatten: false, inset: 0 },
  { file: 'icon-512.png', size: 512, flatten: false, inset: 0 },
  { file: 'icon-maskable-512.png', size: 512, flatten: true, inset: 0.1 },
];

const written = [];

for (const { file, size, flatten, inset } of targets) {
  const artwork = Math.round(size * (1 - inset * 2));
  const pad = Math.round((size - artwork) / 2);

  let image = sharp(svg, { density: 384 })
    .resize(artwork, artwork, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: pad, bottom: pad, left: pad, right: pad,
      background: flatten ? background : { r: 0, g: 0, b: 0, alpha: 0 },
    });

  if (flatten) image = image.flatten({ background });

  const buffer = await image.png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, file), buffer);
  written.push(`  ${file.padEnd(26)} ${String(size).padStart(3)}px  ${(buffer.length / 1024).toFixed(1)} kB`);
}

console.log(`\nIcons written to public/icons (background ${background})\n`);
console.log(written.join('\n'));
console.log('\nReplace public/brand/icon-512.svg and re-run to rebrand.\n');
