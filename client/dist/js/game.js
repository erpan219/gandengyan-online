'use strict';
/* game.js — Gandengyan game state machine.
   Interface compatible with doudizhu-online's ui.js:
   - new Game(cfg, hooks) with hooks.onUpdate(game), hooks.onEvent(name, data)
   - game.buildView(seat) returns the view object ui.js renders
   - game.actPlay(seat, cardIds), game.actPass(seat)
   - game.state: 'playing' | 'settle'
   - game.actorSeat()

   Gandengyan rules (gdy-custom-1.0.0):
   - 3 or 4 players, no teams, no landlord, no bidding
   - 3P: 18 cards each; 4P: 14/14/13/13
   - Counterclockwise turn order (seat+1 mod n)
   - First hand: ♠4 (S-4) holder leads; later hands: previous winner leads
   - Continue until all players finish; placement order = finish order
*/

class Game {
  /* cfg = { playerCount: 3|4, noShuffle, aiDelay, players: [{name, isAI}] } */
  constructor(cfg, hooks) {
    this.cfg = Object.assign({ playerCount: 3, noShuffle: false, aiDelay: 900 }, cfg);
    this.hooks = hooks || {};
    this.n = this.cfg.playerCount;
    this.players = this.cfg.players.map(p => ({ name: p.name, isAI: !!p.isAI }));
    this.scores = Array(this.n).fill(0);
    this.wins = Array(this.n).fill(0);
    this.state = 'idle';
    this.roundNo = 0;
    this.seq = 0;
    this._t = null;
    this.prevWinner = null;
  }

  emit(evName, data) {
    this.seq++;
    if (evName && this.hooks.onEvent) this.hooks.onEvent(evName, data);
    if (this.hooks.onUpdate) this.hooks.onUpdate(this);
  }

  startRound() {
    this.roundNo++;
    const n = this.n;

    // Deal
    const deck = gdyCreateDeck();
    const shuffled = this.cfg.noShuffle ? gdyBarelyShuffle(deck) : gdyShuffle(deck);

    // 3P: 18 each. 4P: 14/14/13/13 (54 cards).
    const handSizes = n === 3 ? [18, 18, 18] : [14, 14, 13, 13];
    this.hands = Array.from({ length: n }, () => []);
    let di = 0;
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < handSizes[s]; i++) {
        this.hands[s].push(shuffled[di++].id);
      }
      gdySortHand(this.hands[s]);
    }

    // Find leader: ♠4 holder on first hand, else previous winner
    let leader = 0;
    if (this.roundNo === 1) {
      for (let s = 0; s < n; s++) {
        if (this.hands[s].includes('S-4')) { leader = s; break; }
      }
    } else if (this.prevWinner != null) {
      leader = this.prevWinner;
    }

    this.state = 'playing';
    this.turn = leader;
    this.trick = { combo: null, seat: null };  // current trick to beat
    this.lastPlays = Array(n).fill(null);
    this.finishOrder = [];
    this.passed = new Set();
    this.result = null;
    this.bombsUsed = 0;

    this.emit('deal');
    this.pump();
  }

  actorSeat() {
    if (this.state === 'playing') return this.turn;
    return null;
  }

  /* Counterclockwise: next seat */
  nextSeat(s) {
    return (s + 1) % this.n;
  }

  isFinished(s) {
    return this.finishOrder.includes(s);
  }

  pump() {
    if (this._t) { clearTimeout(this._t); this._t = null; }
    const s = this.actorSeat();
    if (s == null || !this.players[s].isAI || this.isFinished(s)) return;
    // Fix: check turn ownership instead of seq (seq increments on every emit,
    // which caused intermittent AI freezes when emits happened during the delay)
    const run = () => {
      // Only skip if it's no longer this AI's turn or game state changed
      if (this.actorSeat() !== s) return;
      if (this.isFinished(s)) return;
      this.aiStep(s);
    };
    if (this.cfg.aiDelay <= 0) run();
    else this._t = setTimeout(run, this.cfg.aiDelay + Math.random() * 700);
  }

  aiStep(seat) {
    try {
      const hand = this.hands[seat];
      if (!hand || hand.length === 0) return;
      const prev = this.trick.combo && this.trick.seat !== seat ? this.trick.combo : null;
      // Opponent card counts for strategic AI (excludes self)
      const oppCounts = this.hands.map((h, i) => i === seat ? -1 : h.length).filter(c => c >= 0);
      const play = gdyBotPlay(hand, prev, this.n, oppCounts);
      if (play && play.length) {
        if (!this.actPlay(seat, play)) {
          // actPlay failed, try passing if possible
          if (prev) this.actPass(seat);
        }
      } else if (prev) {
        this.actPass(seat);
      } else {
        // Free lead: play lowest single
        const sorted = hand.slice().sort((a, b) =>
          gdyRankStrength(gdyCardRank(a)) - gdyRankStrength(gdyCardRank(b)));
        if (sorted.length) this.actPlay(seat, [sorted[0]]);
      }
    } catch (e) {
      if (this.hooks.onError) this.hooks.onError(e);
      else if (typeof console !== 'undefined') console.error(e);
      // Recovery: try to pass or play lowest to keep game moving
      try {
        const prev = this.trick.combo && this.trick.seat !== seat ? this.trick.combo : null;
        if (prev) this.actPass(seat);
        else if (this.hands[seat] && this.hands[seat].length) {
          const sorted = this.hands[seat].slice().sort((a, b) =>
            gdyRankStrength(gdyCardRank(a)) - gdyRankStrength(gdyCardRank(b)));
          this.actPlay(seat, [sorted[0]]);
        }
      } catch (e2) { /* give up */ }
    }
  }

  actPlay(seat, cardIds) {
    if (this.state !== 'playing' || seat !== this.turn) return false;
    if (this.isFinished(seat)) return false;

    const hand = this.hands[seat];
    const ids = new Set(cardIds);
    if (ids.size !== cardIds.length) return false;
    if (!cardIds.every(id => hand.includes(id))) return false;

    const prev = this.trick.combo && this.trick.seat !== seat ? this.trick.combo : null;
    const cls = gdyClassify(cardIds, this.n);
    if (!cls.ok) return false;
    if (prev && !gdyCanBeat(cls.combination, prev)) return false;

    // Apply
    this.hands[seat] = hand.filter(id => !ids.has(id));
    this.trick = { combo: cls.combination, seat };
    const comboForUi = {
      type: cls.combination.kind.toLowerCase().replace('_bomb', 'bomb'),
      rank: cls.combination.strength,
    };
    this.lastPlays[seat] = {
      cards: cardIds.map(id => ({ id, r: this.rankNum(id), s: this.suitNum(id) })),
      combo: comboForUi,
      pass: false
    };
    // Clear others' last plays when starting new trick
    if (!prev) {
      for (let i = 0; i < this.n; i++) {
        if (i !== seat) this.lastPlays[i] = null;
      }
      this.passed.clear();
    }
    if (gdyBombTier(cls.combination.kind) > 0) {
      this.bombsUsed++;
      this.emit('bomb', { seat, kind: cls.combination.kind });
    }

    // Check finish
    if (this.hands[seat].length === 0) {
      this.finishOrder.push(seat);
      this.emit('finish', { seat, place: this.finishOrder.length });
      if (this.finishOrder.length >= this.n - 1) {
        // Last player automatically last
        for (let i = 0; i < this.n; i++) {
          if (!this.isFinished(i)) { this.finishOrder.push(i); break; }
        }
        this.endRound();
        return true;
      }
    }

    // Next turn (counterclockwise, skip finished)
    let next = this.nextSeat(seat);
    while (this.isFinished(next)) next = this.nextSeat(next);
    this.turn = next;

    this.emit('play', { seat, cardIds });
    this.pump();
    return true;
  }

  actPass(seat) {
    if (this.state !== 'playing' || seat !== this.turn) return false;
    if (this.isFinished(seat)) return false;
    const prev = this.trick.combo && this.trick.seat !== seat ? this.trick.combo : null;
    if (!prev) return false;  // can't pass on free lead

    this.lastPlays[seat] = { pass: true };
    this.passed.add(seat);

    let next = this.nextSeat(seat);
    while (this.isFinished(next)) next = this.nextSeat(next);

    // Check if trick should reset: all active players except the last to play have passed
    const lastPlayer = this.trick.seat;
    // Count active players who haven't passed and aren't the last player
    let needPass = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.isFinished(i)) continue;
      if (i === lastPlayer) continue;
      if (!this.passed.has(i)) needPass++;
    }

    if (needPass === 0) {
      // Everyone else passed -> trick resets, next active player after lastPlayer leads
      // (or the lastPlayer themselves if still active)
      let leader = lastPlayer;
      if (leader == null || this.isFinished(leader)) {
        leader = this.nextSeat(lastPlayer != null ? lastPlayer : seat);
        while (this.isFinished(leader)) leader = this.nextSeat(leader);
      }
      this.trick = { combo: null, seat: null };
      this.passed.clear();
      for (let i = 0; i < this.n; i++) this.lastPlays[i] = null;
      this.turn = leader;
      this.emit('trick_reset', { leader: this.turn });
      this.pump();
      return true;
    }

    this.turn = next;
    this.emit('pass', { seat });
    this.pump();
    return true;
  }

  endRound() {
    this.state = 'settle';
    const n = this.n;
    // Scoring: 3P: 2/1/0; 4P: 3/2/1/0
    const points = n === 3 ? [2, 1, 0] : [3, 2, 1, 0];
    const roundScores = Array(n).fill(0);
    this.finishOrder.forEach((seat, idx) => {
      const p = points[idx] || 0;
      roundScores[seat] = p;
      this.scores[seat] += p;
    });
    // Bomb bonus: +1 per bomb used (split among? simplified: each player gets +bombs they used)
    this.wins[this.finishOrder[0]]++;
    this.prevWinner = this.finishOrder[0];

    this.result = {
      finishOrder: this.finishOrder.slice(),
      roundScores,
      scores: this.scores.slice(),
      bombsUsed: this.bombsUsed,
    };
    this.emit('settle', this.result);
  }

  /* Stop the game (clear AI timers) */
  stop() {
    if (this._t) { clearTimeout(this._t); this._t = null; }
    this.state = 'idle';
  }

  /* Start a new round */
  nextRound() {
    if (this._t) { clearTimeout(this._t); this._t = null; }
    this.startRound();
  }

  /* Convert our card ID to his numeric rank/suit for ui.js cardHTML */
  rankNum(id) {
    const r = gdyCardRank(id);
    // Map to his rank numbers: 3..15 for 3..2, 16=SJ, 17=BJ
    // Our order: 4=0 ... A=10, 2=11, 3=12, SJ=13, BJ=14
    // His: 3=3 ... K=13, A=14, 2=15, SJ=16, BJ=17
    const map = { '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15, 'SJ': 16, 'BJ': 17 };
    return map[r];
  }

  suitNum(id) {
    if (id === 'SJ' || id === 'BJ') return -1;
    // S=0, H=1, D=2, C=3 → his: SUITS = ['♠','♥','♦','♣'], s index
    const map = { 'S': 0, 'H': 1, 'D': 2, 'C': 3 };
    return map[id[0]];
  }

  cardObj(id) {
    return { id, r: this.rankNum(id), s: this.suitNum(id) };
  }

  /* Build the view object that ui.js renders */
  buildView(seat) {
    const settle = this.state === 'settle';
    const trickCombo = this.trick.combo ? {
      type: this.trick.combo.kind.toLowerCase(),
      rank: this.trick.combo.strength,
      cards: this.trick.combo.cardIds.map(id => this.cardObj(id)),
    } : null;

    return {
      state: this.state,
      mode: 'gdy',
      flags: { noShuffle: !!this.cfg.noShuffle },
      n: this.n,
      mySeat: seat,
      roundNo: this.roundNo,
      actor: this.actorSeat(),
      trick: { combo: trickCombo, seat: this.trick.seat },
      liveMult: 1,
      players: this.players.map((p, i) => ({
        name: p.name,
        isAI: p.isAI,
        cardCount: this.hands ? this.hands[i].length : 0,
        landlord: false,
        ally: false,
        score: this.scores[i],
        wins: this.wins[i],
        lastPlay: this.lastPlays ? this.lastPlays[i] : null,
        hand: settle ? this.hands[i].map(id => this.cardObj(id)) : undefined,
      })),
      myHand: this.hands ? this.hands[seat].map(id => this.cardObj(id)) : [],
      result: this.result ? {
        finishOrder: this.result.finishOrder,
        scores: this.result.scores,
        roundScores: this.result.roundScores,
      } : null,
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game };
}
