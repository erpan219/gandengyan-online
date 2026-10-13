import type { CardId, Combination, PlayerView } from './types.js';
import { getLegalMoves } from './engine.js';
import { bombTier } from './classify.js';
import { cardIdToRank, rankStrength } from './deck.js';

export type BotMove = { type: 'PLAY'; cardIds: CardId[] } | { type: 'PASS' };

type Pattern = { counts: number[]; size: number };
type RankedMove = { play: Combination; score: number; turns: number; control: number; damage: number };

function countsFor(cards: CardId[]): number[] {
  const counts = Array<number>(15).fill(0);
  for (const id of cards) counts[rankStrength(cardIdToRank(id))]++;
  return counts;
}

/**
 * Partition rank counts into legal plays. Suits are interchangeable, so this
 * reuses legal move shapes instead of exploring permutations of physical cards.
 * The search is bounded; unusually large hands fall back to a legal greedy
 * partition, never to a made-up combination or an illegal move.
 */
function handPlanner(leadMoves: Combination[]) {
  const patterns: Pattern[] = leadMoves.map(play => ({ counts: countsFor(play.cardIds), size: play.cardCount }))
    .sort((a, b) => b.size - a.size);
  const byRank = Array.from({ length: 15 }, (_, rank) => patterns.filter(p => p.counts[rank] > 0));
  const memo = new Map<string, number>();
  let visited = 0;
  const fits = (pattern: Pattern, counts: number[]) => pattern.counts.every((n, i) => n <= counts[i]);
  const subtract = (counts: number[], pattern: Pattern) => counts.map((n, i) => n - pattern.counts[i]);
  const greedy = (counts: number[]): number => {
    let remaining = counts.slice();
    let turns = 0;
    while (remaining.some(Boolean)) {
      const play = patterns.find(p => fits(p, remaining))!;
      remaining = subtract(remaining, play);
      turns++;
    }
    return turns;
  };
  const turns = (counts: number[]): number => {
    const first = counts.findIndex(n => n > 0);
    if (first < 0) return 0;
    const key = counts.join('');
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (++visited > 6000) return greedy(counts);
    let best = counts.reduce((sum, n) => sum + n, 0);
    // Every partition has a play containing this rank: anchoring removes the
    // factorial number of equivalent play orders without removing solutions.
    for (const pattern of byRank[first]) {
      if (!fits(pattern, counts)) continue;
      best = Math.min(best, 1 + turns(subtract(counts, pattern)));
      if (best === 1) break;
    }
    memo.set(key, best);
    return best;
  };
  return turns;
}

/** Relative ability to retain the lead, not a claim about hidden hands. */
function controlValue(play: Combination): number {
  const tier = bombTier(play.kind);
  if (tier === 3) return 1;
  if (tier === 2) return 0.82 + play.strength / 80;
  if (tier === 1) return 0.55 + play.strength / 40;
  const maxStrength = play.kind === 'SINGLE' ? 14 : play.kind === 'PAIR' ? 12 :
    11 - (play.kind === 'PAIR_RUN' ? play.cardCount / 2 : play.cardCount);
  const relative = maxStrength === 0 ? 1 : play.strength / maxStrength;
  return relative * relative;
}

function rankMoves(view: PlayerView, playerCount: 3 | 4, moves: Combination[]): RankedMove[] {
  const counts = countsFor(view.selfHand);
  const leadMoves = view.lastPlay ? getLegalMoves({ ...view, lastPlay: null }, playerCount) : moves;
  const turnsFor = handPlanner(leadMoves);
  const initialTurns = turnsFor(counts);
  const opponents = view.players.filter(p => p.id !== view.selfId && p.place === null && p.cardCount > 0);
  const oneCardThreat = opponents.some(p => p.cardCount === 1);
  const urgent = opponents.some(p => p.cardCount <= 2);
  return moves.map(play => {
    const used = countsFor(play.cardIds);
    const remaining = counts.map((n, i) => n - used[i]);
    const turns = turnsFor(remaining);
    const control = controlValue(play);
    const tier = bombTier(play.kind);
    let score = -32 * turns + play.cardCount * 1.6;
    // Losing a useful grouping costs a future turn; these smaller penalties
    // preserve flexible control cards when two partitions are equally short.
    for (let rank = 0; rank < 13; rank++) {
      if (used[rank] && remaining[rank]) score -= counts[rank] >= 3 ? 14 : counts[rank] === 2 ? 4 : 0;
    }
    if (counts[13] && counts[14] && used[13] !== used[14]) score -= 16;
    score -= tier ? 9 + tier : play.strength * 0.35;
    if (turns === 1) score += control * 18;
    else if (turns === 2) score += control * 5;

    if (!view.lastPlay) {
      // A one-card opponent cannot go out over a pair/run. A high single can
      // still be correct when it retains control for our final combination.
      if (oneCardThreat) score += play.kind === 'SINGLE' ? -44 * (1 - control) : 12;
      if (!tier && opponents.some(p => p.cardCount === play.cardCount && p.cardCount <= 4)) {
        score -= 8 * (1 - control);
      }
    } else {
      if (oneCardThreat && view.lastPlay.combination.kind === 'SINGLE') score += control * 75;
      else if (urgent) score += control * 24;
    }
    return { play, score, turns, control, damage: 1 + turns - initialTurns };
  }).sort((a, b) => b.score - a.score || b.play.cardCount - a.play.cardCount ||
    bombTier(a.play.kind) - bombTier(b.play.kind) || a.play.strength - b.play.strength ||
    a.play.cardIds.join(',').localeCompare(b.play.cardIds.join(',')));
}

function shouldPass(view: PlayerView, best: RankedMove): boolean {
  if (!view.lastPlay) return false;
  const opponents = view.players.filter(p => p.id !== view.selfId && p.place === null && p.cardCount > 0);
  const urgent = opponents.some(p => p.cardCount <= 2);
  const owner = view.players.find(p => p.id === view.lastPlay!.playerId);
  // If the winner of this trick already finished and every other active
  // player passed, passing may give us a free lead without spending a stopper.
  if (owner && (owner.place !== null || owner.cardCount === 0)) {
    const ownerIndex = view.players.indexOf(owner);
    const next = Array.from({ length: view.players.length }, (_, i) => view.players[(ownerIndex + i + 1) % view.players.length])
      .find(p => p.place === null && p.cardCount > 0);
    if (next?.id === view.selfId && opponents.every(p => view.passedSinceLastPlay.includes(p.id))) return true;
  }
  if (urgent) return false;
  if (bombTier(best.play.kind)) {
    // Spend a bomb for a short route out or to take control from a player
    // approaching the finish; do not enter a bomb war merely because we can.
    return best.turns > 2 && !(owner && owner.place === null && owner.cardCount <= 4);
  }
  // A cheap response is still useful progress. Save expensive stoppers
  // when using one would also split a useful grouping in a long hand.
  return best.damage > 0 && best.turns >= 3 && best.control > 0.65;
}

/**
 * One bot level, using only the player's hand and public PlayerView data.
 * Prefer short complete-hand plans, keep useful groups/control cards, and
 * adapt to opponents near the finish. No rules or hidden hands are simulated.
 * Small context-based tie variation remains deterministic for replay/debugging.
 */
export function chooseBotMove(view: PlayerView, playerCount: 3 | 4): BotMove {
  const moves = getLegalMoves(view, playerCount);
  if (!moves.length) return { type: 'PASS' };
  const finisher = moves.find(play => play.cardCount === view.selfHand.length);
  if (finisher) return { type: 'PLAY', cardIds: finisher.cardIds };
  const ranked = rankMoves(view, playerCount, moves);
  const playable = ranked.filter(option => !shouldPass(view, option));
  if (!playable.length) return { type: 'PASS' };
  const best = playable[0];
  // Variation cannot trade away a move of progress, a bomb, or meaningful
  // endgame control. It only breaks ties between strategically similar plays.
  const near = playable.filter(option => best.score - option.score <= 0.7 && option.turns === best.turns &&
    option.play.cardCount === best.play.cardCount && bombTier(option.play.kind) === bombTier(best.play.kind) &&
    Math.abs(option.control - best.control) < 0.12 && !shouldPass(view, option));
  let hash = 2166136261;
  const key = `${view.gameId}|${view.selfId}|${view.revision}|${view.selfHand.slice().sort().join(',')}`;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return { type: 'PLAY', cardIds: near[(hash >>> 0) % near.length].play.cardIds };
}

export function shouldBotPlayNow(view: PlayerView): boolean {
  return view.status === 'PLAYING' && view.currentPlayerId === view.selfId;
}
