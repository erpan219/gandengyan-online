import type { Card, CardId, NaturalRank, PlayerId, Rank, Suit } from './types.js';

const SUITS: Suit[] = ['S', 'H', 'C', 'D'];
const NATURAL_RANKS: NaturalRank[] = [
  '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3',
];

const STRENGTH: Record<Rank, number> = {
  '4': 0, '5': 1, '6': 2, '7': 3, '8': 4, '9': 5, '10': 6,
  'J': 7, 'Q': 8, 'K': 9, 'A': 10, '2': 11, '3': 12,
  'SJ': 13, 'BJ': 14,
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of NATURAL_RANKS) {
      deck.push({ id: `${suit}-${rank}`, rank, suit });
    }
  }
  deck.push({ id: 'SJ', rank: 'SJ', suit: null });
  deck.push({ id: 'BJ', rank: 'BJ', suit: null });
  return deck;
}

export function cardIdToRank(id: CardId): Rank {
  if (id === 'SJ' || id === 'BJ') return id;
  return id.slice(2) as NaturalRank;
}

export function rankStrength(rank: Rank): number {
  return STRENGTH[rank];
}

/** Round-robin deal of all 54 cards starting at startSeatIndex. */
export function dealCards(
  deck: CardId[],
  seats: PlayerId[],
  startSeatIndex: number,
): Record<PlayerId, CardId[]> {
  const hands: Record<PlayerId, CardId[]> = {};
  for (const s of seats) hands[s] = [];
  deck.forEach((cardId, i) => {
    const seat = seats[(startSeatIndex + i) % seats.length];
    hands[seat].push(cardId);
  });
  return hands;
}

/** Fisher-Yates shuffle; injectable RNG for tests. */
export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
