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

/* Bot: pick a play. Returns cardIds or null for pass. */
function gdyBotPlay(handIds, target, playerCount, oppCounts) {
  oppCounts = oppCounts || [];
  const plays = gdyFindPlays(handIds, target, playerCount);
  if (!plays.length) return null;

  // === Heuristic 1: Hand evaluation ===
  const rankCount = {};
  for (const id of handIds) {
    const r = gdyCardRank(id);
    rankCount[r] = (rankCount[r] || 0) + 1;
  }
  const isBombRank = (r) => (rankCount[r] || 0) >= 3 && r !== 'SJ' && r !== 'BJ';
  const highRanks = ['3', '2', 'SJ', 'BJ'];

  // === NEW: Adaptive Hand Role Evaluation ===
  // Classify hand as sprinter (can finish fast), controller (has bombs/high cards),
  // or spoiler (disrupt opponents). Updates strategy accordingly.
  const bombCount = Object.keys(rankCount).filter(r => isBombRank(r)).length;
  const highCardCount = handIds.filter(id => highRanks.includes(gdyCardRank(id))).length;
  const singletonCount = Object.values(rankCount).filter(c => c === 1).length;
  const handSize = handIds.length;

  let handRole = 'spoiler'; // default: disrupt
  if (handSize <= 8 && singletonCount <= 2) handRole = 'sprinter'; // can finish fast
  else if (bombCount >= 1 || highCardCount >= 4) handRole = 'controller'; // has power

  // === Heuristic: Opponent threat detection ===
  const oppThreat = oppCounts.some(c => c <= 2);
  const oppCloseToWin = oppCounts.some(c => c <= 4);
  const minOppCards = oppCounts.length ? Math.min(...oppCounts) : 99;

  // Filter: don't break bombs for ordinary plays (unless desperate)
  const preservesBombs = (play) => {
    if (gdyBombTier(play.kind) > 0) return true;
    for (const id of play.cardIds) {
      if (isBombRank(gdyCardRank(id))) return false;
    }
    return true;
  };
  const smart = plays.filter(preservesBombs);
  const pool = smart.length ? smart : plays;

  // === Heuristic 2: Lead strategy (enhanced with probe planning & role) ===
  if (!target) {
    const noBombLead = pool.filter(p => gdyBombTier(p.kind) === 0);
    const leadPool = noBombLead.length ? noBombLead : pool;

    const scored = leadPool.map(p => {
      let score = p.cardCount * 10;
      if (p.kind === 'PAIR' || p.kind === 'PAIR_RUN') score += 5;
      if (p.kind === 'STRAIGHT') score += 8;
      if (p.strength > 10) score -= (p.strength - 10) * 2;

      // NEW: Lead Shaping - probe with small singles to find stoppers
      if (p.kind === 'SINGLE' && p.strength <= 6) {
        score += 6; // Probe: cheap info about opponent strength
      }
      // NEW: Avoid giving next player easy tempo unless we can regain control
      if (handRole === 'controller' && p.strength < 8 && p.cardCount === 1) {
        score -= 4; // Controller prefers keeping initiative with stronger leads
      }
      // NEW: Sprinter plays fastest - prioritize max cards dumped
      if (handRole === 'sprinter') {
        score += p.cardCount * 5; // Extra bonus for dumping
        if (p.strength > 10) score += 10; // Sprinter uses high cards to finish
      }
      // NEW: Spoiler disrupts - prefer plays that force responses
      if (handRole === 'spoiler' && p.kind === 'SINGLE' && p.strength >= 8 && p.strength <= 11) {
        score += 5; // Mid-high singles force opponents to spend
      }

      // Humanlike variance: larger random factor for less predictability
      score += Math.random() * 5;
      return { play: p, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // NEW: Endgame Line Search - check if we can force a win in 2 moves
    if (handIds.length <= 8) {
      for (const s of scored.slice(0, 3)) {
        const remaining = handIds.length - s.play.cardCount;
        if (remaining <= 3) {
          // Likely can finish next turn - prioritize
          return s.play.cardIds;
        }
      }
    }
    // Endgame: if we can go out, do it
    if (handIds.length <= 6) {
      const finisher = scored.find(s => s.play.cardCount >= handIds.length - 2);
      if (finisher) return finisher.play.cardIds;
    }
    return scored[0].play.cardIds;
  }

  // === Heuristic 3: Response strategy - beat only if worth it ===
  const nonBombs = pool.filter(p => gdyBombTier(p.kind) === 0);

  if (nonBombs.length) {
    const scored = nonBombs.map(p => {
      let score = 100 - p.strength;
      if (p.cardCount === 1 && p.strength < 8) score += 10;
      if (target.strength < 6 && p.strength >= 8) score -= 45;
      if (oppThreat) score += 15;

      // NEW: Threat-Aware Response Costing - evaluate future tempo
      // If opponent is close to winning, deny them the exact card type they need
      if (minOppCards <= 3) {
        // Opponent likely needs a specific play to win - overplay to block
        score += 20;
        // Prefer using mid-strength cards to block (save highest for later)
        if (p.strength >= 8 && p.strength <= 11) score += 8;
      }
      // NEW: Role-based response
      if (handRole === 'sprinter' && p.cardCount > 1) {
        score += 12; // Sprinter dumps multiple cards when possible
      }
      if (handRole === 'controller' && p.strength > 12) {
        score -= 15; // Controller saves top cards for decisive moments
      }
      // NEW: Don't waste high cards on low-value tricks when safe
      const trickValue = target.strength;
      if (!oppThreat && !oppCloseToWin && trickValue < 7 && p.strength > 10) {
        score -= 25; // Preserve high cards for meaningful tricks
      }

      // Humanlike variance
      score += Math.random() * 7;
      return { play: p, score };
    });
    scored.sort((a, b) => b.score - a.score);

    if (!oppThreat && scored[0].score < 70) return null;
    return scored[0].play.cardIds;
  }

  // === Heuristic 4: Bomb management (contextual valuation) ===
  const bombs = pool.filter(p => gdyBombTier(p.kind) > 0);
  if (bombs.length) {
    const targetIsBomb = target && gdyBombTier(target.kind) > 0;
    const winWithBomb = bombs.some(b => {
      const remaining = handIds.length - b.cardIds.length;
      return remaining === 0;
    });

    // NEW: Contextual Bomb Valuation - only bomb when it creates decisive value
    let bombValue = 0;
    let bombReason = '';
    if (oppThreat) { bombValue += 50; bombReason = 'block_win'; }
    else if (targetIsBomb) { bombValue += 30; bombReason = 'bomb_war'; }
    else if (winWithBomb) { bombValue += 60; bombReason = 'instant_win'; }
    else if (handIds.length <= 5) { bombValue += 25; bombReason = 'endgame'; }
    else if (oppCloseToWin && minOppCards <= 4) { bombValue += 20; bombReason = 'threat'; }
    // NEW: Don't bomb low-value tricks - save for better leverage
    if (!oppThreat && target && target.strength < 8 && gdyBombTier(target.kind) === 0) {
      bombValue -= 30; // Low-value trick, better to save bomb
    }
    // NEW: Controller role values bombs more highly
    if (handRole === 'controller') bombValue += 10;

    const shouldBomb = bombValue >= 25 || winWithBomb;

    if (shouldBomb) {
      bombs.sort((a, b) => gdyBombTier(a.kind) - gdyBombTier(b.kind) || a.strength - b.strength);
      // NEW: Humanlike deception - occasionally use bigger bomb to bluff strength
      let idx = 0;
      if (bombs.length > 1 && Math.random() < 0.15 && bombReason === 'block_win') {
        idx = 1; // 15% chance to overplay when blocking (unpredictable)
      }
      return bombs[idx].cardIds;
    }
  }

  return null; // pass
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
