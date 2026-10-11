#!/usr/bin/env node
// Build the browser deck bundle from the shared TypeScript source (PR5 module 1).
// The client loads scripts as plain globals (no bundler); only tsc is available.
// shared/deck.ts imports ONLY types (erased at compile), so the emitted JS has
// no runtime imports — we strip the `export` keywords and wrap in an IIFE.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(repo, 'client', 'dist', 'js', 'gdy-shared-deck.js');

const tmp = mkdtempSync(join(tmpdir(), 'gdy-deck-'));
try {
  execSync(`npx tsc --target es2020 --module esnext --skipLibCheck --outDir "${tmp}" shared/deck.ts`, {
    cwd: repo, stdio: 'pipe',
  });
  let js = readFileSync(join(tmp, 'deck.js'), 'utf8');
  if (/^\s*import[^\n]*from/m.test(js)) {
    throw new Error('shared/deck.ts gained a runtime import — bundle script needs updating');
  }
  js = js.replace(/^export /gm, '');
  if (/^\s*export[\s{]/m.test(js)) {
    throw new Error('unhandled export form in compiled deck.js');
  }
  const bundle = `'use strict';
/* GENERATED from shared/deck.ts — do not hand-edit.
 * Rebuild: node scripts/build-gdy-shared-deck.mjs
 * PR5 module 1: the client's deck functions (gdyCreateDeck/gdyCardRank/
 * gdyRankStrength/gdyShuffle/gdyBarelyShuffle) now come from the shared
 * TypeScript source instead of the hand-ported copy. */
(function () {
${js.trimEnd()}
  // Shims: keep the gdy* global names used by ui.js / game.js.
  globalThis.gdyCreateDeck = function () { return createDeck(); };
  globalThis.gdyCardRank = function (id) { return cardIdToRank(id); };
  globalThis.gdyRankStrength = function (rank) { return rankStrength(rank); };
  globalThis.gdyShuffle = function (arr, rand) { return shuffle(arr, rand); };
  globalThis.gdyBarelyShuffle = function (arr, rand) { return barelyShuffle(arr, rand); };
  // Namespace for later shared bundles (PR5 module 2+: classify imports deck).
  globalThis.GdyShared = { createDeck, cardIdToRank, rankStrength, shuffle, barelyShuffle, dealCards };
})();
`;
  writeFileSync(outFile, bundle);
  console.log('wrote', outFile);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
