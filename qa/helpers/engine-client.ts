import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import type { CardId, Combination, Classification } from '../../shared/types.js';
import { seededRandom } from './engine.js';

type BrowserClassification = Exclude<Classification, { ok: false }> |
  { ok: false; code: 'EMPTY' | 'DUPLICATE' | 'UNKNOWN' | 'INVALID' };

interface BrowserEngine {
  classify(cards: CardId[], players: 3 | 4): BrowserClassification;
  canBeat(candidate: Combination, target: Combination): boolean;
  findPlays(cards: CardId[], target: Combination | null, players: 3 | 4): Combination[];
  hint(cards: CardId[], target: Combination | null, players: 3 | 4, opponents: number[]): CardId[] | null;
}

/** Execute the real shipped browser asset in an isolated Node VM, with deterministic RNG. */
export function loadBrowserEngine(seed = 20261011): BrowserEngine {
  const file = new URL('../../client/dist/js/gdy-engine.js', import.meta.url);
  const source = readFileSync(file, 'utf8');
  const math = Object.create(Math) as Math;
  math.random = seededRandom(seed);
  const context = createContext({ Math: math });
  runInContext(`${source}\nglobalThis.qaEngine = {
    classify: gdyClassify, canBeat: gdyCanBeat, findPlays: gdyFindPlays, hint: gdyHint
  };`, context, { filename: file.pathname, timeout: 5000 });
  return context.qaEngine as BrowserEngine;
}

/** Intentional API spelling differences, not permissive normalization of unknown failures. */
export const BROWSER_ERROR_CODES = {
  EMPTY_SELECTION: 'EMPTY', DUPLICATE_CARD: 'DUPLICATE', UNKNOWN_CARD: 'UNKNOWN', INVALID_COMBINATION: 'INVALID',
} as const;
