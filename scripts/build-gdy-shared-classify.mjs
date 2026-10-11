#!/usr/bin/env node
// Build the browser classifier bundle from the shared TypeScript source (PR5 module 2).
// Follows scripts/build-gdy-shared-deck.mjs. classify.ts imports deck functions
// at runtime; in the browser those come from globalThis.GdyShared (deck bundle,
// loaded before this one).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(repo, 'client', 'dist', 'js', 'gdy-shared-classify.js');

const tmp = mkdtempSync(join(tmpdir(), 'gdy-classify-'));
try {
  execSync(`npx tsc --target es2020 --module esnext --skipLibCheck --outDir "${tmp}" shared/classify.ts`, {
    cwd: repo, stdio: 'pipe',
  });
  let js = readFileSync(join(tmp, 'classify.js'), 'utf8');
  // Rewrite the single runtime import (deck) to the browser namespace.
  const deckImport = /^\s*import\s*\{[^}]*\}\s*from\s*['"]\.\/deck\.js['"];?\s*$/m;
  if (!deckImport.test(js)) {
    throw new Error('expected runtime import from ./deck.js not found in compiled classify.js');
  }
  js = js.replace(deckImport, 'const { cardIdToRank, rankStrength } = globalThis.GdyShared;');
  if (/^\s*import[^\n]*from/m.test(js)) {
    throw new Error('classify.ts gained an unexpected runtime import — bundle script needs updating');
  }
  js = js.replace(/^export /gm, '');
  if (/^\s*export[\s{]/m.test(js)) {
    throw new Error('unhandled export form in compiled classify.js');
  }
  // Client error-code spellings (call sites only check `ok`, but keep the
  // contract identical to the port this replaces).
  const bundle = `'use strict';
/* GENERATED from shared/classify.ts — do not hand-edit.
 * Rebuild: node scripts/build-gdy-shared-classify.mjs
 * PR5 module 2: the client's classifier (gdyClassify/gdyCanBeat/gdyBombTier)
 * now comes from the shared TypeScript source instead of the hand-ported copy. */
(function () {
${js.trimEnd()}
  const CODE_MAP = {
    EMPTY_SELECTION: 'EMPTY',
    DUPLICATE_CARD: 'DUPLICATE',
    UNKNOWN_CARD: 'UNKNOWN',
    INVALID_COMBINATION: 'INVALID',
  };
  // Shims: keep the gdy* global names used by ui.js / game.js.
  globalThis.gdyClassify = function (cardIds, playerCount) {
    const r = classifyHand(cardIds, playerCount);
    if (r.ok) return r;
    return { ok: false, code: CODE_MAP[r.code] || 'INVALID' };
  };
  globalThis.gdyCanBeat = function (candidate, target) { return canBeat(candidate, target); };
  globalThis.gdyBombTier = function (kind) { return bombTier(kind); };
  // Namespace for later shared bundles (PR5 module 3: engine imports classify).
  globalThis.GdyClassify = { classifyHand, canBeat, bombTier };
})();
`;
  writeFileSync(outFile, bundle);
  console.log('wrote', outFile);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
