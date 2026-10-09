'use strict';
/* gdy-engine.js — Gandengyan (干瞪眼) core engine, ported from TypeScript.
   Rules: gdy-custom-1.0.0
   - 3 or 4 players, 54 cards
   - 3P: 18/18/18, 4P: 14/14/13/13
   - Counterclockwise seats
   - First hand: ♠4 holder leads (need not include ♠4)
   - Later hands: previous winner leads
   - Rank: 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2 < 3 < SJ < BJ
   - ROCKET (SJ+BJ) > FOUR_BOMB > TRIPLE_BOMB > ordinary
   - Straights/pair runs: 4 through A only
   - No kickers, no wildcards
*/

const GDY_SUITS = ['S', 'H', 'C', 'D'];
const GDY_RANKS = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3'];
const GDY_STRENGTH = {
  '4': 0, '5': 1, '6': 2, '7': 3, '8': 4, '9': 5, '10': 6,
  'J': 7, 'Q': 8, 'K': 9, 'A': 10, '2': 11, '3': 12,
  'SJ': 13, 'BJ': 14,
};
const GDY_SEQ_RANKS = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const GDY_CARD_RE = /^[SHCD]-(4|5|6|7|8|9|10|J|Q|K|A|2|3)$/;

/* Card: { id, rank, suit } — id like 'S-4', 'H-10', 'SJ', 'BJ' */
function gdyCreateDeck() {
  const deck = [];
  for (const suit of GDY_SUITS) {
    for (const rank of GDY_RANKS) {
      deck.push({ id: `${suit}-${rank}`, rank, suit });
    }
  }
  deck.push({ id: 'SJ', rank: 'SJ', suit: null });
  deck.push({ id: 'BJ', rank: 'BJ', suit: null });
  return deck;
}

function gdyCardRank(id) {
  if (id === 'SJ' || id === 'BJ') return id;
  return id.slice(2);
}

function gdyRankStrength(rank) {
  return GDY_STRENGTH[rank];
}

function gdyShuffle(arr, rand) {
  rand = rand || Math.random;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Barely shuffle: few swaps, ranks stay clumped → bombs everywhere */
function gdyBarelyShuffle(arr, rand) {
  rand = rand || Math.random;
  const a = arr.slice();
  const swaps = 8 + Math.floor(rand() * 5);
  for (let k = 0; k < swaps; k++) {
    const i = Math.floor(rand() * a.length);
    const j = Math.floor(rand() * a.length);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function gdyBombTier(kind) {
  switch (kind) {
    case 'ROCKET': return 3;
    case 'FOUR_BOMB': return 2;
    case 'TRIPLE_BOMB': return 1;
    default: return 0;
  }
}

/* Classify a set of card IDs into a combination. Returns { ok, combination } or { ok:false, code } */
function gdyClassify(cardIds, playerCount) {
  if (!cardIds.length) return { ok: false, code: 'EMPTY' };
  if (new Set(cardIds).size !== cardIds.length) return { ok: false, code: 'DUPLICATE' };
  for (const id of cardIds) {
    if (id !== 'SJ' && id !== 'BJ' && !GDY_CARD_RE.test(id)) {
      return { ok: false, code: 'UNKNOWN' };
    }
  }

  const ranks = cardIds.map(gdyCardRank);
  const n = cardIds.length;
  const ids = cardIds.slice();

  // ROCKET: SJ + BJ
  if (n === 2 && ranks.includes('SJ') && ranks.includes('BJ')) {
    return { ok: true, combination: { kind: 'ROCKET', cardIds: ids, cardCount: 2, strength: 0 } };
  }
  if (n === 1) {
    return { ok: true, combination: { kind: 'SINGLE', cardIds: ids, cardCount: 1, strength: gdyRankStrength(ranks[0]) } };
  }

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);

  // All same rank
  if (counts.size === 1) {
    const rank = ranks[0];
    if (rank === 'SJ' || rank === 'BJ') return { ok: false, code: 'INVALID' };
    const s = gdyRankStrength(rank);
    if (n === 2) return { ok: true, combination: { kind: 'PAIR', cardIds: ids, cardCount: 2, strength: s } };
    if (n === 3) return { ok: true, combination: { kind: 'TRIPLE_BOMB', cardIds: ids, cardCount: 3, strength: s } };
    if (n === 4) return { ok: true, combination: { kind: 'FOUR_BOMB', cardIds: ids, cardCount: 4, strength: s } };
    return { ok: false, code: 'INVALID' };
  }

  // STRAIGHT: all singles, consecutive, 4..A only
  if (n >= 2 && [...counts.values()].every(c => c === 1)) {
    const minLen = playerCount === 3 ? 4 : 3;
    if (n >= minLen && n <= 11) {
      const idx = [...counts.keys()].map(r => GDY_SEQ_RANKS.indexOf(r));
      if (idx.every(i => i >= 0)) {
        const sorted = idx.slice().sort((a, b) => a - b);
        if (sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1)) {
          return { ok: true, combination: { kind: 'STRAIGHT', cardIds: ids, cardCount: n, strength: sorted[0] } };
        }
      }
    }
  }

  // PAIR_RUN: pairs, consecutive, 4..A only
  if (n >= 4 && n % 2 === 0 && [...counts.values()].every(c => c === 2)) {
    const pairCount = n / 2;
    if (pairCount >= 2 && pairCount <= 11) {
      const idx = [...counts.keys()].map(r => GDY_SEQ_RANKS.indexOf(r));
      if (idx.every(i => i >= 0)) {
        const sorted = idx.slice().sort((a, b) => a - b);
        if (sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1)) {
          return { ok: true, combination: { kind: 'PAIR_RUN', cardIds: ids, cardCount: n, strength: sorted[0] } };
        }
      }
    }
  }

  return { ok: false, code: 'INVALID' };
}

function gdyCanBeat(candidate, target) {
  const ct = gdyBombTier(candidate.kind);
  const tt = gdyBombTier(target.kind);
  if (ct !== tt) return ct > tt;
  if (ct > 0) return candidate.strength > target.strength;
  return candidate.kind === target.kind &&
         candidate.cardCount === target.cardCount &&
         candidate.strength > target.strength;
}

/* Sort hand by strength descending */
function gdySortHand(hand) {
  hand.sort((a, b) => gdyRankStrength(gdyCardRank(b)) - gdyRankStrength(gdyCardRank(a)) ||
                      gdyCardRank(a).localeCompare(gdyCardRank(b)));
  return hand;
}

/* Find all playable combinations from a hand that beat target (or any if no target) */
function gdyFindPlays(handIds, target, playerCount) {
  const plays = [];
  const n = handIds.length;
  // Try all subsets (practical for small hands; limit to reasonable sizes)
  // For efficiency, group by rank first
  const byRank = new Map();
  for (const id of handIds) {
    const r = gdyCardRank(id);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(id);
  }

  const tryCombo = (ids) => {
    const c = gdyClassify(ids, playerCount);
    if (c.ok && (!target || gdyCanBeat(c.combination, target))) {
      plays.push(c.combination);
    }
  };

  // Singles, pairs, triple bombs, four bombs
  for (const [rank, ids] of byRank) {
    if (rank === 'SJ' || rank === 'BJ') continue;
    tryCombo([ids[0]]);
    if (ids.length >= 2) tryCombo(ids.slice(0, 2));
    if (ids.length >= 3) tryCombo(ids.slice(0, 3));
    if (ids.length >= 4) tryCombo(ids.slice(0, 4));
  }
  // Jokers as singles
  for (const [rank, ids] of byRank) {
    if (rank === 'SJ' || rank === 'BJ') tryCombo([ids[0]]);
  }
  // Rocket
  const sj = byRank.get('SJ'), bj = byRank.get('BJ');
  if (sj && bj) tryCombo([sj[0], bj[0]]);

  // Straights and pair runs (brute force over rank sequences)
  const ranks = GDY_SEQ_RANKS;
  for (let len = playerCount === 3 ? 4 : 3; len <= 11; len++) {
    for (let start = 0; start + len <= ranks.length; start++) {
      const seqRanks = ranks.slice(start, start + len);
      // Straight: one of each
      if (seqRanks.every(r => byRank.has(r))) {
        tryCombo(seqRanks.map(r => byRank.get(r)[0]));
      }
      // Pair run: two of each
      if (seqRanks.every(r => byRank.has(r) && byRank.get(r).length >= 2)) {
        const ids = [];
        seqRanks.forEach(r => ids.push(...byRank.get(r).slice(0, 2)));
        tryCombo(ids);
      }
    }
  }

  return plays;
}

/* Bot: pick a play. Returns cardIds or null for pass. */
function gdyBotPlay(handIds, target, playerCount) {
  const plays = gdyFindPlays(handIds, target, playerCount);
  if (!plays.length) return null;

  // Prefer non-bomb, lowest strength
  const nonBombs = plays.filter(p => gdyBombTier(p.kind) === 0);
  const pool = nonBombs.length ? nonBombs : plays;
  pool.sort((a, b) => {
    const ta = gdyBombTier(a.kind), tb = gdyBombTier(b.kind);
    if (ta !== tb) return ta - tb;
    return a.strength - b.strength;
  });

  // Emergency: if hand is small (<=3 cards) and we have a bomb, use it
  if (handIds.length <= 3) {
    const bombs = plays.filter(p => gdyBombTier(p.kind) > 0);
    if (bombs.length) {
      bombs.sort((a, b) => gdyBombTier(a.kind) - gdyBombTier(b.kind) || a.strength - b.strength);
      return bombs[0].cardIds;
    }
  }

  return pool[0].cardIds;
}

/* Hint: find a play for the player */
function gdyHint(handIds, target, playerCount) {
  return gdyBotPlay(handIds, target, playerCount);
}
