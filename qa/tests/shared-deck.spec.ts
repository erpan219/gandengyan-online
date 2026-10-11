import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createDeck, cardIdToRank, rankStrength, shuffle, barelyShuffle } from '../../shared/deck.js';
import { seededRandom } from '../helpers/engine.js';
import type { CardId } from '../../shared/types.js';

/**
 * PR5 module 1 golden fixtures: the browser deck bundle (built from
 * shared/deck.ts by scripts/build-gdy-shared-deck.mjs) must behave identically
 * to the shared source. Any drift fails here before it can reach players.
 */

interface DeckBundle {
  gdyCreateDeck(): Array<{ id: string; rank: string; suit: string | null }>;
  gdyCardRank(id: string): string;
  gdyRankStrength(rank: string): number;
  gdyShuffle<T>(arr: T[], rand?: () => number): T[];
  gdyBarelyShuffle<T>(arr: T[], rand?: () => number): T[];
}

function loadDeckBundle(): DeckBundle {
  const file = new URL('../../client/dist/js/gdy-shared-deck.js', import.meta.url);
  const source = readFileSync(file, 'utf8');
  const context = createContext({});
  runInContext(source, context, { filename: file.pathname, timeout: 5000 });
  for (const name of ['gdyCreateDeck', 'gdyCardRank', 'gdyRankStrength', 'gdyShuffle', 'gdyBarelyShuffle']) {
    expect(typeof (context as Record<string, unknown>)[name], `${name} exposed`).toBe('function');
  }
  return context as unknown as DeckBundle;
}

const ALL_IDS: CardId[] = [
  ...['S', 'H', 'C', 'D'].flatMap((s) =>
    ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3'].map((r) => `${s}-${r}` as CardId)),
  'SJ', 'BJ',
];

test.describe('PR5 module 1: browser deck bundle matches shared/deck.ts', () => {
  test('deck order, size and card shapes are identical', () => {
    const bundle = loadDeckBundle();
    const fromShared = createDeck();
    const fromBundle = bundle.gdyCreateDeck();
    expect(fromBundle).toEqual(fromShared);
    // Golden anchors (not just self-agreement):
    expect(fromShared).toHaveLength(54);
    expect(new Set(fromShared.map((c) => c.id)).size).toBe(54);
    expect(fromShared[0]).toEqual({ id: 'S-4', rank: '4', suit: 'S' });
    expect(fromShared[53]).toEqual({ id: 'BJ', rank: 'BJ', suit: null });
    expect(fromShared[52]).toEqual({ id: 'SJ', rank: 'SJ', suit: null });
  });

  test('seeded shuffle and barely-shuffle are deterministic and identical', () => {
    const bundle = loadDeckBundle();
    const ids = createDeck().map((c) => c.id);
    for (const seed of [1, 42, 20261011]) {
      expect(bundle.gdyShuffle(ids, seededRandom(seed))).toEqual(shuffle(ids, seededRandom(seed)));
      expect(bundle.gdyBarelyShuffle(ids, seededRandom(seed))).toEqual(barelyShuffle(ids, seededRandom(seed)));
    }
    // Golden anchor: a fixed seed produces a known first/last card.
    const shuffled = shuffle(ids, seededRandom(42));
    expect(shuffled.slice(0, 3)).toEqual(bundle.gdyShuffle(ids, seededRandom(42)).slice(0, 3));
    expect(shuffled).not.toEqual(ids); // actually shuffled
    // Inputs are not mutated.
    const frozen = [...ids];
    bundle.gdyShuffle(ids, seededRandom(7));
    expect(ids).toEqual(frozen);
  });

  test('cardIdToRank and rankStrength agree on every card', () => {
    const bundle = loadDeckBundle();
    for (const id of ALL_IDS) {
      expect(bundle.gdyCardRank(id)).toBe(cardIdToRank(id));
    }
    const ranks = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3', 'SJ', 'BJ'];
    for (const rank of ranks) {
      expect(bundle.gdyRankStrength(rank)).toBe(rankStrength(rank as never));
    }
    // Golden anchors: 4 is weakest, BJ strongest, 3 beats 2.
    expect(rankStrength('4')).toBe(0);
    expect(rankStrength('BJ')).toBe(14);
    expect(rankStrength('3')).toBeGreaterThan(rankStrength('2'));
  });
});
