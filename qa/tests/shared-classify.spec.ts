import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { classifyHand, canBeat, bombTier } from '../../shared/classify.js';
import type { CardId, Combination, Kind } from '../../shared/types.js';

/**
 * PR5 module 2 golden fixtures: the browser classifier bundle (built from
 * shared/classify.ts by scripts/build-gdy-shared-classify.mjs) must behave
 * identically to the shared source. The client-facing error-code spellings
 * (EMPTY/DUPLICATE/UNKNOWN/INVALID) are preserved by the shims.
 */

interface ClassifyBundle {
  gdyClassify(cardIds: string[], playerCount: 3 | 4): unknown;
  gdyCanBeat(candidate: Combination, target: Combination): boolean;
  gdyBombTier(kind: Kind): number;
}

const CODE_MAP: Record<string, string> = {
  EMPTY_SELECTION: 'EMPTY',
  DUPLICATE_CARD: 'DUPLICATE',
  UNKNOWN_CARD: 'UNKNOWN',
  INVALID_COMBINATION: 'INVALID',
};

function loadClassifyBundle(): ClassifyBundle {
  const deckFile = new URL('../../client/dist/js/gdy-shared-deck.js', import.meta.url);
  const classifyFile = new URL('../../client/dist/js/gdy-shared-classify.js', import.meta.url);
  const context = createContext({});
  runInContext(readFileSync(deckFile, 'utf8'), context, { filename: deckFile.pathname, timeout: 5000 });
  runInContext(readFileSync(classifyFile, 'utf8'), context, { filename: classifyFile.pathname, timeout: 5000 });
  for (const name of ['gdyClassify', 'gdyCanBeat', 'gdyBombTier']) {
    expect(typeof (context as Record<string, unknown>)[name], `${name} exposed`).toBe('function');
  }
  return context as unknown as ClassifyBundle;
}

/** Translate a shared Classification to the client code spelling for comparison. */
function toClientShape(r: ReturnType<typeof classifyHand>): unknown {
  if (r.ok) return r;
  return { ok: false, code: CODE_MAP[r.code] ?? 'INVALID' };
}

const RANKS = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3'] as const;
const KINDS: Kind[] = ['SINGLE', 'PAIR', 'STRAIGHT', 'PAIR_RUN', 'TRIPLE_BOMB', 'FOUR_BOMB', 'ROCKET'];

test.describe('PR5 module 2: browser classifier bundle matches shared/classify.ts', () => {
  test('gdyClassify agrees with classifyHand across the combination corpus', () => {
    const bundle = loadClassifyBundle();
    const corpus: CardId[][] = [];
    for (const r of RANKS) {
      corpus.push([`S-${r}` as CardId]); // single
      corpus.push([`S-${r}`, `H-${r}`] as CardId[]); // pair
      corpus.push([`S-${r}`, `H-${r}`, `C-${r}`] as CardId[]); // triple bomb
      corpus.push([`S-${r}`, `H-${r}`, `C-${r}`, `D-${r}`] as CardId[]); // four bomb
    }
    corpus.push(['SJ', 'BJ']); // rocket
    corpus.push(['S-4', 'H-5', 'C-6', 'D-7']); // straight
    corpus.push(['S-4', 'H-5', 'C-6', 'D-7', 'S-8', 'H-9', 'C-10', 'D-J', 'S-Q', 'H-K', 'C-A']); // 11-straight
    corpus.push(['S-4', 'H-4', 'S-5', 'H-5']); // pair run
    // Invalid inputs
    corpus.push([]);
    corpus.push(['S-4', 'S-4'] as CardId[]);
    corpus.push(['X-9'] as unknown as CardId[]);
    corpus.push(['S-4', 'H-4', 'C-4', 'D-4', 'S-5'] as CardId[]); // 5 of a kind
    corpus.push(['SJ', 'BJ', 'S-4'] as CardId[]); // jokers + card
    corpus.push(['SJ', 'SJ'] as CardId[]); // joker pair
    for (const playerCount of [3, 4] as const) {
      for (const ids of corpus) {
        expect(bundle.gdyClassify(ids, playerCount)).toEqual(toClientShape(classifyHand(ids, playerCount)));
      }
    }
  });

  test('gdyCanBeat agrees with canBeat across the kind matrix', () => {
    const bundle = loadClassifyBundle();
    const mk = (kind: Kind, strength: number, cardCount = 2): Combination =>
      ({ kind, cardIds: [], cardCount, strength });
    for (const ck of KINDS) {
      for (const tk of KINDS) {
        for (const [cs, ts] of [[5, 3], [3, 5], [4, 4]]) {
          const c = mk(ck, cs);
          const t = mk(tk, ts);
          expect(bundle.gdyCanBeat(c, t)).toBe(canBeat(c, t));
        }
      }
    }
    // Ordinary kinds need same cardCount: covered above with cardCount=2 for
    // all; also verify count-mismatch never beats for ordinary kinds.
    expect(bundle.gdyCanBeat(mk('PAIR', 5, 2), mk('PAIR', 3, 4))).toBe(false);
    // Golden anchors (not just self-agreement):
    expect(bundle.gdyCanBeat(mk('ROCKET', 0), mk('FOUR_BOMB', 14))).toBe(true);
    expect(bundle.gdyCanBeat(mk('TRIPLE_BOMB', 14), mk('FOUR_BOMB', 0))).toBe(false);
    expect(bundle.gdyCanBeat(mk('SINGLE', 12), mk('SINGLE', 11))).toBe(true); // 3 beats 2
    expect(bundle.gdyCanBeat(mk('PAIR_RUN', 0), mk('PAIR_RUN', 1))).toBe(false);
    expect(bundle.gdyCanBeat(mk('ROCKET', 0), mk('ROCKET', 0))).toBe(false);
  });

  test('gdyBombTier agrees with bombTier for every kind', () => {
    const bundle = loadClassifyBundle();
    for (const kind of KINDS) {
      expect(bundle.gdyBombTier(kind)).toBe(bombTier(kind));
    }
    expect(bombTier('ROCKET')).toBe(3);
    expect(bombTier('SINGLE')).toBe(0);
  });
});
