import type {
  CardId,
  Classification,
  Combination,
  Kind,
  Rank,
} from './types.js';
import { cardIdToRank, rankStrength } from './deck.js';

const CARD_ID_RE = /^[SHCD]-(4|5|6|7|8|9|10|J|Q|K|A|2|3)$/;
/** Ranks allowed in straights / pair-runs, ascending. */
const SEQ_RANKS: Rank[] = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function isKnownCard(id: CardId): boolean {
  return id === 'SJ' || id === 'BJ' || CARD_ID_RE.test(id);
}

function bombTier(kind: Kind): number {
  switch (kind) {
    case 'ROCKET': return 3;
    case 'FOUR_BOMB': return 2;
    case 'TRIPLE_BOMB': return 1;
    default: return 0;
  }
}

export function classifyHand(cardIds: CardId[], playerCount: 3 | 4): Classification {
  if (cardIds.length === 0) {
    return { ok: false, code: 'EMPTY_SELECTION' };
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return { ok: false, code: 'DUPLICATE_CARD' };
  }
  for (const id of cardIds) {
    if (!isKnownCard(id)) return { ok: false, code: 'UNKNOWN_CARD' };
  }

  const ranks = cardIds.map(cardIdToRank);
  const n = cardIds.length;

  const single = (rank: Rank): Classification => ({
    ok: true,
    combination: { kind: 'SINGLE', cardIds: [...cardIds], cardCount: 1, strength: rankStrength(rank) },
  });

  // ROCKET: exactly SJ + BJ
  if (n === 2 && ranks.includes('SJ') && ranks.includes('BJ')) {
    return {
      ok: true,
      combination: { kind: 'ROCKET', cardIds: [...cardIds], cardCount: 2, strength: 0 },
    };
  }

  if (n === 1) return single(ranks[0]);

  // Count per rank
  const counts = new Map<Rank, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);

  // All-same-rank combos
  if (counts.size === 1) {
    const rank = ranks[0];
    if (rank === 'SJ' || rank === 'BJ') {
      return { ok: false, code: 'INVALID_COMBINATION' }; // Jokers can't pair/bomb alone
    }
    const s = rankStrength(rank);
    if (n === 2) {
      return { ok: true, combination: { kind: 'PAIR', cardIds: [...cardIds], cardCount: 2, strength: s } };
    }
    if (n === 3) {
      return { ok: true, combination: { kind: 'TRIPLE_BOMB', cardIds: [...cardIds], cardCount: 3, strength: s } };
    }
    if (n === 4) {
      return { ok: true, combination: { kind: 'FOUR_BOMB', cardIds: [...cardIds], cardCount: 4, strength: s } };
    }
    return { ok: false, code: 'INVALID_COMBINATION' };
  }

  // STRAIGHT: one card per rank, consecutive, 4..A only
  if (n >= 2 && [...counts.values()].every((c) => c === 1)) {
    const minLen = playerCount === 3 ? 4 : 3;
    if (n >= minLen && n <= 11) {
      const idx = [...counts.keys()].map((r) => SEQ_RANKS.indexOf(r));
      if (idx.every((i) => i >= 0)) {
        const sorted = [...idx].sort((a, b) => a - b);
        const consecutive = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
        if (consecutive) {
          return {
            ok: true,
            combination: { kind: 'STRAIGHT', cardIds: [...cardIds], cardCount: n, strength: sorted[0] },
          };
        }
      }
    }
  }

  // PAIR_RUN: >=2 consecutive ranks, exactly 2 each, even total
  if (n >= 4 && n % 2 === 0 && [...counts.values()].every((c) => c === 2)) {
    const pairCount = n / 2;
    if (pairCount >= 2 && pairCount <= 11) {
      const idx = [...counts.keys()].map((r) => SEQ_RANKS.indexOf(r));
      if (idx.every((i) => i >= 0)) {
        const sorted = [...idx].sort((a, b) => a - b);
        const consecutive = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
        if (consecutive) {
          return {
            ok: true,
            combination: { kind: 'PAIR_RUN', cardIds: [...cardIds], cardCount: n, strength: sorted[0] },
          };
        }
      }
    }
  }

  return { ok: false, code: 'INVALID_COMBINATION' };
}

export function canBeat(candidate: Combination, target: Combination): boolean {
  const ct = bombTier(candidate.kind);
  const tt = bombTier(target.kind);
  if (ct !== tt) return ct > tt;
  if (ct > 0) {
    // Same bomb tier: strictly higher strength; ROCKET never beats ROCKET (equal)
    return candidate.strength > target.strength;
  }
  // Ordinary: same kind, same count, strictly higher strength
  return (
    candidate.kind === target.kind &&
    candidate.cardCount === target.cardCount &&
    candidate.strength > target.strength
  );
}
