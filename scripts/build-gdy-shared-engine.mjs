#!/usr/bin/env node
// Build the browser engine bundle from the shared TypeScript source (PR5 module 3).
// Follows build-gdy-shared-deck/classify.mjs. engine.ts imports deck and classify
// at runtime; in the browser those come from globalThis.GdyShared / GdyClassify
// (earlier bundles, loaded before this one). Only getLegalMoves is shimmed —
// the bot *strategies* (gdyBotPlay/gdyHint) intentionally stay client-side.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(repo, 'client', 'dist', 'js', 'gdy-shared-engine.js');

const tmp = mkdtempSync(join(tmpdir(), 'gdy-engine-'));
try {
  execSync(`npx tsc --target es2020 --module esnext --skipLibCheck --strict --outDir "${tmp}" shared/engine.ts`, {
    cwd: repo, stdio: 'pipe',
  });
  let js = readFileSync(join(tmp, 'engine.js'), 'utf8');
  const rewrites = [
    [/^\s*import\s*\{[^}]*\}\s*from\s*['"]\.\/deck\.js['"];?\s*$/m,
      'const { dealCards } = globalThis.GdyShared;'],
    [/^\s*import\s*\{[^}]*\}\s*from\s*['"]\.\/classify\.js['"];?\s*$/m,
      'const { canBeat, classifyHand } = globalThis.GdyClassify;'],
  ];
  for (const [pattern, replacement] of rewrites) {
    if (!pattern.test(js)) throw new Error(`expected runtime import not found: ${pattern}`);
    js = js.replace(pattern, replacement);
  }
  if (/^\s*import[^\n]*from/m.test(js)) {
    throw new Error('engine.ts gained an unexpected runtime import — bundle script needs updating');
  }
  js = js.replace(/^export /gm, '');
  if (/^\s*export[\s{]/m.test(js)) {
    throw new Error('unhandled export form in compiled engine.js');
  }
  const bundle = `'use strict';
/* GENERATED from shared/engine.ts — do not hand-edit.
 * Rebuild: node scripts/build-gdy-shared-engine.mjs
 * PR5 module 3: the client's move discovery (gdyFindPlays) now comes from the
 * shared TypeScript source (getLegalMoves) instead of the hand-ported copy.
 * The bot/hint *strategies* stay client-side by design. */
(function () {
${js.trimEnd()}
  // Shim: keep the gdy* global name used by ui.js / game.js / gdy-engine.js.
  // getLegalMoves reads view.selfHand + view.lastPlay; wrap the decomposed args.
  globalThis.gdyFindPlays = function (handIds, target, playerCount) {
    const view = {
      selfHand: handIds,
      lastPlay: target ? { playerId: '', combination: target } : null,
    };
    return getLegalMoves(view, playerCount);
  };
})();
`;
  writeFileSync(outFile, bundle);
  console.log('wrote', outFile);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
