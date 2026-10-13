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

const GDY_SEQ_RANKS = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const GDY_CARD_RE = /^[SHCD]-(4|5|6|7|8|9|10|J|Q|K|A|2|3)$/;

/* NOTE (PR5 module 1): deck functions (gdyCreateDeck/gdyCardRank/gdyRankStrength/
   gdyShuffle/gdyBarelyShuffle) were removed here; they now come from shared/deck.ts
   via js/gdy-shared-deck.js (loaded before this file). */

/* NOTE (PR5 module 2): gdyClassify/gdyCanBeat/gdyBombTier were removed here; they now
   come from shared/classify.ts via js/gdy-shared-classify.js (loaded before this file). */

/* Sort hand by strength descending */
function gdySortHand(hand) {
  hand.sort((a, b) => gdyRankStrength(gdyCardRank(b)) - gdyRankStrength(gdyCardRank(a)) ||
                      gdyCardRank(a).localeCompare(gdyCardRank(b)));
  return hand;
}

/* NOTE (PR5 module 3): gdyFindPlays was removed here; it now comes from
   shared/engine.ts (getLegalMoves) via js/gdy-shared-engine.js (loaded before this file).
   The bot/hint *strategies* (gdyBotPlay/gdyHint*) stay here by design. */

/* Bot planning mirrors shared/bot.ts's rank-pattern evaluation. The server
   also sees public seat/pass context; practice keeps its existing count-only
   interface and uses randomness only for strategically equivalent choices. */
function gdyBotCountsFor(cards) {
    const counts = Array(15).fill(0);
    for (const id of cards)
        counts[gdyRankStrength(gdyCardRank(id))]++;
    return counts;
}
/**
 * Partition rank counts into legal plays. Suits are interchangeable, so this
 * reuses legal move shapes instead of exploring permutations of physical cards.
 * The search is bounded; unusually large hands fall back to a legal greedy
 * partition, never to a made-up combination or an illegal move.
 */
function gdyBotHandPlanner(leadMoves) {
    const patterns = leadMoves.map(play => ({ counts: gdyBotCountsFor(play.cardIds), size: play.cardCount }))
        .sort((a, b) => b.size - a.size);
    const byRank = Array.from({ length: 15 }, (_, rank) => patterns.filter(p => p.counts[rank] > 0));
    const memo = new Map();
    let visited = 0;
    const fits = (pattern, counts) => pattern.counts.every((n, i) => n <= counts[i]);
    const subtract = (counts, pattern) => counts.map((n, i) => n - pattern.counts[i]);
    const greedy = (counts) => {
        let remaining = counts.slice();
        let turns = 0;
        while (remaining.some(Boolean)) {
            const play = patterns.find(p => fits(p, remaining));
            remaining = subtract(remaining, play);
            turns++;
        }
        return turns;
    };
    const turns = (counts) => {
        const first = counts.findIndex(n => n > 0);
        if (first < 0)
            return 0;
        const key = counts.join('');
        const cached = memo.get(key);
        if (cached !== undefined)
            return cached;
        if (++visited > 6000)
            return greedy(counts);
        let best = counts.reduce((sum, n) => sum + n, 0);
        // Every partition has a play containing this rank: anchoring removes the
        // factorial number of equivalent play orders without removing solutions.
        for (const pattern of byRank[first]) {
            if (!fits(pattern, counts))
                continue;
            best = Math.min(best, 1 + turns(subtract(counts, pattern)));
            if (best === 1)
                break;
        }
        memo.set(key, best);
        return best;
    };
    return turns;
}
/** Relative ability to retain the lead, not a claim about hidden hands. */
function gdyBotControlValue(play) {
    const tier = gdyBombTier(play.kind);
    if (tier === 3)
        return 1;
    if (tier === 2)
        return 0.82 + play.strength / 80;
    if (tier === 1)
        return 0.55 + play.strength / 40;
    const maxStrength = play.kind === 'SINGLE' ? 14 : play.kind === 'PAIR' ? 12 :
        11 - (play.kind === 'PAIR_RUN' ? play.cardCount / 2 : play.cardCount);
    const relative = maxStrength === 0 ? 1 : play.strength / maxStrength;
    return relative * relative;
}
function gdyBotRankMoves(view, playerCount, moves) {
    const counts = gdyBotCountsFor(view.selfHand);
    const leadMoves = view.lastPlay ? gdyFindPlays(view.selfHand, null, playerCount) : moves;
    const turnsFor = gdyBotHandPlanner(leadMoves);
    const initialTurns = turnsFor(counts);
    const opponents = view.players.filter(p => p.id !== view.selfId && p.place === null && p.cardCount > 0);
    const oneCardThreat = opponents.some(p => p.cardCount === 1);
    const urgent = opponents.some(p => p.cardCount <= 2);
    return moves.map(play => {
        const used = gdyBotCountsFor(play.cardIds);
        const remaining = counts.map((n, i) => n - used[i]);
        const turns = turnsFor(remaining);
        const control = gdyBotControlValue(play);
        const tier = gdyBombTier(play.kind);
        let score = -32 * turns + play.cardCount * 1.6;
        // Losing a useful grouping costs a future turn; these smaller penalties
        // preserve flexible control cards when two partitions are equally short.
        for (let rank = 0; rank < 13; rank++) {
            if (used[rank] && remaining[rank])
                score -= counts[rank] >= 3 ? 14 : counts[rank] === 2 ? 4 : 0;
        }
        if (counts[13] && counts[14] && used[13] !== used[14])
            score -= 16;
        score -= tier ? 9 + tier : play.strength * 0.35;
        if (turns === 1)
            score += control * 18;
        else if (turns === 2)
            score += control * 5;
        if (!view.lastPlay) {
            // A one-card opponent cannot go out over a pair/run. A high single can
            // still be correct when it retains control for our final combination.
            if (oneCardThreat)
                score += play.kind === 'SINGLE' ? -44 * (1 - control) : 12;
            if (!tier && opponents.some(p => p.cardCount === play.cardCount && p.cardCount <= 4)) {
                score -= 8 * (1 - control);
            }
        }
        else {
            if (oneCardThreat && view.lastPlay.combination.kind === 'SINGLE')
                score += control * 75;
            else if (urgent)
                score += control * 24;
        }
        return { play, score, turns, control, damage: 1 + turns - initialTurns };
    }).sort((a, b) => b.score - a.score || b.play.cardCount - a.play.cardCount ||
        gdyBombTier(a.play.kind) - gdyBombTier(b.play.kind) || a.play.strength - b.play.strength ||
        a.play.cardIds.join(',').localeCompare(b.play.cardIds.join(',')));
}
function gdyBotShouldPass(view, best) {
    if (!view.lastPlay)
        return false;
    const opponents = view.players.filter(p => p.id !== view.selfId && p.place === null && p.cardCount > 0);
    const urgent = opponents.some(p => p.cardCount <= 2);
    const owner = view.players.find(p => p.id === view.lastPlay.playerId);
    // If the winner of this trick already finished and every other active
    // player passed, passing may give us a free lead without spending a stopper.
    if (owner && (owner.place !== null || owner.cardCount === 0)) {
        const ownerIndex = view.players.indexOf(owner);
        const next = Array.from({ length: view.players.length }, (_, i) => view.players[(ownerIndex + i + 1) % view.players.length])
            .find(p => p.place === null && p.cardCount > 0);
        if (next?.id === view.selfId && opponents.every(p => view.passedSinceLastPlay.includes(p.id)))
            return true;
    }
    if (urgent)
        return false;
    if (gdyBombTier(best.play.kind)) {
        // Spend a bomb for a short route out or to take control from a player
        // approaching the finish; do not enter a bomb war merely because we can.
        return best.turns > 2 && !(owner && owner.place === null && owner.cardCount <= 4);
    }
    // A cheap response is still useful progress. Save expensive stoppers
  // when using one would also split a useful grouping in a long hand.
  return best.damage > 0 && best.turns >= 3 && best.control > 0.65;
}
/* Bot: pick a legal play using only our hand, target and public card counts. */
function gdyBotPlay(handIds, target, playerCount, oppCounts) {
  const moves = gdyFindPlays(handIds, target, playerCount);
  if (!moves.length) return null;
  // Finish before preservation rules: splitting a bomb/rocket is correct when
  // the entire hand is a legal winning response.
  const finisher = moves.find(play => play.cardCount === handIds.length);
  if (finisher) return finisher.cardIds;
  const view = {
    selfHand: handIds, selfId: 'self',
    lastPlay: target ? { playerId: 'target', combination: target } : null,
    players: (oppCounts || []).filter(count => Number.isFinite(count) && count > 0)
      .map((count, i) => ({ id: 'opponent' + i, cardCount: count, place: null })),
    passedSinceLastPlay: []
  };
  const ranked = gdyBotRankMoves(view, playerCount, moves)
    .filter(option => !gdyBotShouldPass(view, option));
  if (!ranked.length) return null;
  const best = ranked[0];
  const near = ranked.filter(option => best.score - option.score <= 0.7 && option.turns === best.turns &&
    option.play.cardCount === best.play.cardCount && gdyBombTier(option.play.kind) === gdyBombTier(best.play.kind) &&
    Math.abs(option.control - best.control) < 0.12);
  return near[Math.floor(Math.random() * near.length)].play.cardIds;
}

/* Hint: find a play for the player */
// Ranked hint system: returns scored plays with explanations, cycles through alternatives
let _hintCache = { key: null, plays: [], idx: 0 };

function gdyHintRanked(handIds, target, playerCount, oppCounts) {
  oppCounts = oppCounts || [];
  const plays = gdyFindPlays(handIds, target, playerCount);
  if (!plays.length) return [];

  const rankCount = {};
  for (const id of handIds) {
    const r = gdyCardRank(id);
    rankCount[r] = (rankCount[r] || 0) + 1;
  }
  const isBombRank = (r) => (rankCount[r] || 0) >= 3 && r !== 'SJ' && r !== 'BJ';
  const oppThreat = oppCounts.some(c => c <= 2);

  // Score each play using AI heuristics
  const scored = plays.map(p => {
    let score = 50;
    let reason = 'safe';

    const tier = gdyBombTier(p.kind);
    const preserves = tier > 0 || !p.cardIds.some(id => isBombRank(gdyCardRank(id)));

    if (!target) {
      // Leading: prefer efficient dumps
      score = p.cardCount * 10;
      if (p.kind === 'STRAIGHT') { score += 8; reason = 'tempo'; }
      else if (p.kind === 'PAIR' || p.kind === 'PAIR_RUN') { score += 5; reason = 'efficient'; }
      if (p.strength > 10) { score -= (p.strength - 10) * 2; reason = 'save_high'; }
      if (!preserves) { score -= 30; reason = 'breaks_bomb'; }
    } else {
      // Responding
      if (tier > 0) {
        score = 40 + tier * 10;
        if (oppThreat) { score += 25; reason = 'block_win'; }
        else if (handIds.length <= 5) { score += 15; reason = 'endgame'; }
        else { score -= 20; reason = 'save_bomb'; }
      } else {
        score = 100 - p.strength;
        if (p.cardCount === 1 && p.strength < 8) { score += 10; reason = 'dump_low'; }
        if (target.strength < 6 && p.strength >= 8) { score -= 45; reason = 'wasteful'; }
        if (oppThreat) { score += 15; reason = 'block_win'; }
        if (!preserves) { score -= 25; reason = 'breaks_bomb'; }
      }
    }
    score += Math.random() * 2; // tie-breaker
    return { play: p, score, reason };
  });

  // Sort by score, deduplicate
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const ranked = [];
  for (const s of scored) {
    const key = s.play.kind + ':' + s.play.cardIds.slice().sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    // Confidence based on score gap from top
    const gap = scored[0].score - s.score;
    s.confidence = gap < 5 ? 'best' : gap < 20 ? 'good' : 'safe';
    ranked.push(s);
    if (ranked.length >= 5) break; // top 5 alternatives
  }
  return ranked;
}

function gdyHint(handIds, target, playerCount, oppCounts) {
  const key = handIds.slice().sort().join(',') + '|' +
    (target ? target.kind + ':' + target.cardCount + ':' + target.strength : 'lead') + '|' + playerCount;
  // Reset cycle if game state changed
  if (_hintCache.key !== key) {
    _hintCache = { key, plays: gdyHintRanked(handIds, target, playerCount, oppCounts), idx: 0 };
  }
  if (!_hintCache.plays.length) return null;
  const result = _hintCache.plays[_hintCache.idx % _hintCache.plays.length];
  _hintCache.idx++;
  return result.play.cardIds;
}

// Get explanation for current hint
function gdyHintExplanation() {
  if (!_hintCache.plays.length) return null;
  const idx = (_hintCache.idx - 1 + _hintCache.plays.length) % _hintCache.plays.length;
  return _hintCache.plays[idx];
}
