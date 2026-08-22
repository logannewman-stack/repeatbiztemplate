#!/usr/bin/env node
/**
 * ============================================================================
 * SHARED FOUNDATION — CHECK AND PULL
 * ============================================================================
 *   node scripts/shared.mjs check          report drift, exit 1 if any
 *   node scripts/shared.mjs pull           copy the canonical version over ours
 *   node scripts/shared.mjs check --from ../elsewhere
 *
 * The other repo is found next to this one by default, which is how anyone
 * working on both will have them checked out. Override with --from or
 * SHARED_SOURCE.
 * ============================================================================
 */

import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL, SHARED, DIVERGENT, NOT_SHARED } from './shared-files.mjs';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('--')) ?? 'check';

const fromFlag = args.indexOf('--from');
const OTHER = resolve(
  fromFlag !== -1 ? args[fromFlag + 1]
  : process.env.SHARED_SOURCE ?? join(HERE, '..', CANONICAL)
);

const weAreCanonical = HERE.endsWith(CANONICAL);

if (!existsSync(OTHER)) {
  console.error(
    `\nCannot find the other repo at:\n  ${OTHER}\n\n` +
    `Check it out beside this one, or pass --from <path>.\n` +
    `Both repos are needed to keep the shared foundation honest.\n`
  );
  process.exit(2);
}

/** Every file under a shared path, relative to a repo root. */
function walk(root, rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [rel];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const child = join(rel, entry.name);
    if (entry.isDirectory()) {
      // A repo's own tests for shared code are its own business.
      if (entry.name === '__tests__') continue;
      out.push(...walk(root, child));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(child);
    }
  }
  return out;
}

const files = [...new Set(SHARED.flatMap((p) => [...walk(HERE, p), ...walk(OTHER, p)]))]
  .filter((f) => !NOT_SHARED.includes(f))
  .sort();

const read = (root, f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);

const drifted = [];
const divergent = [];
const missingHere = [];
const missingThere = [];

for (const f of files) {
  const ours = read(HERE, f);
  const theirs = read(OTHER, f);

  if (ours === theirs) continue;
  if (f in DIVERGENT) { divergent.push(f); continue; }
  if (ours === null) { missingHere.push(f); continue; }
  if (theirs === null) { missingThere.push(f); continue; }
  drifted.push(f);
}

const label = weAreCanonical ? 'this repo (canonical)' : `${CANONICAL} (canonical)`;
/** Whichever repo is not this one, named for the messages below. */
const otherName = weAreCanonical ? OTHER.split('/').filter(Boolean).pop() : CANONICAL;

if (mode === 'pull') {
  if (weAreCanonical) {
    console.error(
      '\nThis IS the canonical repo. Pulling would overwrite the source of ' +
      'truth with a copy of itself.\nRun `shared:pull` in the other repo ' +
      'instead, or fix the drift here by hand.\n'
    );
    process.exit(2);
  }

  const toCopy = [...drifted, ...missingHere];
  for (const f of toCopy) {
    const src = read(OTHER, f);
    if (src === null) continue;
    mkdirSync(dirname(join(HERE, f)), { recursive: true });
    writeFileSync(join(HERE, f), src);
    console.log(`  updated  ${f}`);
  }
  console.log(
    toCopy.length
      ? `\n${toCopy.length} file(s) pulled from ${CANONICAL}. Run the tests.`
      : '\nAlready in sync.'
  );
  if (missingThere.length) {
    console.log(
      `\n${missingThere.length} file(s) exist here but not in ${CANONICAL}:\n` +
      missingThere.map((f) => `  ${f}`).join('\n') +
      `\nThese were not touched. If they belong to both, copy them the other way.`
    );
  }
  process.exit(0);
}

// --- check -----------------------------------------------------------------

console.log(`\nShared foundation — ${files.length} files, against ${label}\n`);

if (divergent.length) {
  console.log('Divergent on purpose:');
  for (const f of divergent) console.log(`  ${f}\n    ${DIVERGENT[f]}`);
  console.log('');
}

const problems = drifted.length + missingHere.length + missingThere.length;

if (!problems) {
  console.log('In sync.\n');
  process.exit(0);
}

if (drifted.length) {
  console.log('Drifted — same file, different contents:');
  for (const f of drifted) {
    const a = read(HERE, f).split('\n').length;
    const b = read(OTHER, f).split('\n').length;
    console.log(`  ${f}  (here ${a} lines, there ${b})`);
  }
  console.log('');
}
if (missingHere.length) {
  console.log('Missing here:');
  for (const f of missingHere) console.log(`  ${f}`);
  console.log('');
}
if (missingThere.length) {
  console.log(`Missing in ${otherName}:`);
  for (const f of missingThere) console.log(`  ${f}`);
  console.log('');
}

console.log(
  weAreCanonical
    ? 'This is the canonical repo. Run `npm run shared:pull` in the other one.\n'
    : 'Run `npm run shared:pull` to take the canonical version.\n'
);
process.exit(1);
