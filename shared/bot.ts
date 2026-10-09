import type { CardId, Combination, PlayerView } from './types.js';
import { getLegalMoves } from './engine.js';

export type BotMove = { type: 'PLAY'; cardIds: CardId[] } | { type: 'PASS' };

function isBomb(c: Combination): boolean {
  return c.kind === 'TRIPLE_BOMB' || c.kind === 'FOUR_BOMB' || c.kind === 'ROCKET';
}

/** Deterministic ordering: lowest strength, then fewest cards, then lexicographic. */
function compareMoves(a: Combination, b: Combination): number {
  if (a.strength !== b.strength) return a.strength - b.strength;
  if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount;
  const ka = [...a.cardIds].sort().join(',');
  const kb = [...b.cardIds].sort().join(',');
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * BOT-01: one explainable bot level.
 * - Finish immediately if the whole hand is one legal combination.
 * - Free lead: lowest single; never lead a bomb unless forced.
 * - Response: lowest ordinary beating move; bomb only as an emergency
 *   (no ordinary move beats and 3 or fewer cards remain); else pass.
 * Pure and deterministic (no randomness).
 */
export function chooseBotMove(view: PlayerView, playerCount: 3 | 4): BotMove {
  const moves = getLegalMoves(view, playerCount).sort(compareMoves);
  if (moves.length === 0) return { type: 'PASS' };

  const handSize = view.selfHand.length;

  // Instant finish: whole hand is one legal combination
  const finisher = moves.find((m) => m.cardCount === handSize);
  if (finisher) return { type: 'PLAY', cardIds: finisher.cardIds };

  if (view.lastPlay === null) {
    // Free lead: lowest single first; avoid leading bombs
    const single = moves.find((m) => m.kind === 'SINGLE');
    if (single) return { type: 'PLAY', cardIds: single.cardIds };
    const ordinary = moves.find((m) => !isBomb(m));
    if (ordinary) return { type: 'PLAY', cardIds: ordinary.cardIds };
    return { type: 'PLAY', cardIds: moves[0].cardIds }; // only bombs available
  }

  // Response: lowest ordinary beating move
  const ordinary = moves.find((m) => !isBomb(m));
  if (ordinary) return { type: 'PLAY', cardIds: ordinary.cardIds };

  // Emergency bomb: only when nearly out and nothing else beats
  if (handSize <= 3) {
    const bomb = moves.find(isBomb);
    if (bomb) return { type: 'PLAY', cardIds: bomb.cardIds };
  }
  return { type: 'PASS' };
}

export function shouldBotPlayNow(view: PlayerView): boolean {
  return view.status === 'PLAYING' && view.currentPlayerId === view.selfId;
}
