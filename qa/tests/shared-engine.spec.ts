import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { getLegalMoves } from '../../shared/engine.js';
import type { CardId, Combination, PlayerView } from '../../shared/types.js';

/**
 * PR5 module 3 golden fixtures: the browser engine bundle (built from
 * shared/engine.ts by scripts/build-gdy-shared-engine.mjs) exposes gdyFindPlays,
 * which must match shared getLegalMoves exactly. The bot/hint *strategies*
 * stay client-side by design — only move discovery is unified.
 */

interface EngineBundle {
  gdyFindPlays(handIds: string[], target: Combination | null, playerCount: 3 | 4): Combination[];
}

function loadEngineBundle(): EngineBundle {
  const files = ['gdy-shared-deck.js', 'gdy-shared-classify.js', 'gdy-shared-engine.js']
    .map((f) => new URL(`../../client/dist/js/${f}`, import.meta.url));
  const context = createContext({});
  for (const file of files) {
    runInContext(readFileSync(file, 'utf8'), context, { filename: file.pathname, timeout: 5000 });
  }
  expect(typeof (context as Record<string, unknown>).gdyFindPlays, 'gdyFindPlays exposed').toBe('function');
  return context as unknown as EngineBundle;
}

const sig = (moves: Combination[]) =>
  moves.map((m) => `${m.kind}:${m.cardCount}:${m.strength}:${[...m.cardIds].sort().join(',')}`).sort();

function directMoves(hand: CardId[], target: Combination | null, playerCount: 3 | 4): Combination[] {
  const view = {
    selfHand: hand,
    lastPlay: target ? { playerId: 'p2', combination: target } : null,
  } as PlayerView;
  return getLegalMoves(view, playerCount);
}

test.describe('PR5 module 3: browser gdyFindPlays matches shared getLegalMoves', () => {
  test('identical move sets across hands, targets and player counts', () => {
    const bundle = loadEngineBundle();
    const hands: CardId[][] = [
      ['S-4', 'H-4', 'S-5', 'H-5', 'S-6', 'SJ', 'BJ'],
      ['S-2', 'H-2', 'C-2', 'S-3', 'H-3', 'C-3', 'D-9'],
      ['S-10', 'H-J', 'C-Q', 'D-K', 'S-A', 'H-4', 'C-7'],
    ];
    const targets: Array<Combination | null> = [
      null,
      { kind: 'SINGLE', cardIds: ['H-9'], cardCount: 1, strength: 5 },
      { kind: 'TRIPLE_BOMB', cardIds: ['S-4', 'H-4', 'C-4'], cardCount: 3, strength: 0 },
      { kind: 'PAIR', cardIds: ['S-K', 'H-K'], cardCount: 2, strength: 9 },
    ];
    for (const playerCount of [3, 4] as const) {
      for (const hand of hands) {
        for (const target of targets) {
          expect(sig(bundle.gdyFindPlays(hand, target, playerCount)))
            .toEqual(sig(directMoves(hand, target, playerCount)));
        }
      }
    }
  });

  test('golden anchors: known hands produce known move sets', () => {
    const bundle = loadEngineBundle();
    // Rocket must be discovered; the only bomb in a weak hand.
    const rocket = bundle.gdyFindPlays(['SJ', 'BJ', 'S-4'], null, 3);
    expect(rocket.map((m) => m.kind).sort()).toEqual(['ROCKET', 'SINGLE', 'SINGLE', 'SINGLE']);
    // Nothing beats a rocket.
    const rocketTarget: Combination = { kind: 'ROCKET', cardIds: ['SJ', 'BJ'], cardCount: 2, strength: 0 };
    expect(bundle.gdyFindPlays(['S-2', 'H-2', 'C-2', 'D-2'], rocketTarget, 3)).toEqual([]);
    // Free lead offers every legal move; constrained target filters.
    const free = bundle.gdyFindPlays(['S-6', 'H-6', 'C-6'], null, 3);
    expect(free.map((m) => m.kind).sort()).toEqual(['PAIR', 'SINGLE', 'TRIPLE_BOMB']);
  });
});
