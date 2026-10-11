'use strict';
/* GENERATED from shared/engine.ts — do not hand-edit.
 * Rebuild: node scripts/build-gdy-shared-engine.mjs
 * PR5 module 3: the client's move discovery (gdyFindPlays) now comes from the
 * shared TypeScript source (getLegalMoves) instead of the hand-ported copy.
 * The bot/hint *strategies* stay client-side by design. */
(function () {
const { dealCards } = globalThis.GdyShared;
const { canBeat, classifyHand } = globalThis.GdyClassify;
function isActive(state, playerId) {
    return !state.finishOrder.includes(playerId);
}
function activePlayers(state) {
    return state.seatOrder.filter((p) => isActive(state, p));
}
/** Deep-copy the mutable parts of state for pure updates. */
function copyState(s) {
    return {
        ...s,
        hands: Object.fromEntries(Object.entries(s.hands).map(([k, v]) => [k, [...v]])),
        lastPlay: s.lastPlay
            ? {
                playerId: s.lastPlay.playerId,
                combination: {
                    ...s.lastPlay.combination,
                    cardIds: [...s.lastPlay.combination.cardIds],
                },
            }
            : null,
        passedSinceLastPlay: [...s.passedSinceLastPlay],
        trickCards: [...s.trickCards],
        discard: [...s.discard],
        finishOrder: [...s.finishOrder],
        seatOrder: [...s.seatOrder],
    };
}
function nextActiveAfter(state, actorId) {
    const idx = state.seatOrder.indexOf(actorId);
    for (let i = 1; i <= state.seatOrder.length; i++) {
        const cand = state.seatOrder[(idx + i) % state.seatOrder.length];
        if (isActive(state, cand))
            return cand;
    }
    throw new Error('nextActiveAfter: no active player');
}
function newHand(seats, playerCount, handNumber, leaderId, shuffledDeck, startSeatIndex) {
    return {
        rulesVersion: 'gdy-custom-1.0.0',
        gameId: `g${handNumber}`,
        handNumber,
        playerCount,
        revision: 0,
        seatOrder: [...seats],
        hands: dealCards(shuffledDeck, seats, startSeatIndex),
        currentPlayerId: leaderId,
        lastPlay: null,
        passedSinceLastPlay: [],
        trickCards: [],
        discard: [],
        finishOrder: [],
        status: 'PLAYING',
    };
}
function fail(state, code) {
    return { ok: false, code, state };
}
function applyAction(state, action, actor) {
    // ---- Validation (no mutation) ----
    if (action.gameId !== state.gameId)
        return fail(state, 'WRONG_GAME');
    if (action.expectedRevision !== state.revision)
        return fail(state, 'STALE_REVISION');
    if (state.status !== 'PLAYING')
        return fail(state, 'HAND_NOT_PLAYING');
    if (actor.playerId !== state.currentPlayerId)
        return fail(state, 'NOT_YOUR_TURN');
    let combination = null;
    if (action.type === 'PLAY') {
        const cls = classifyHand(action.cardIds, state.playerCount);
        if (!cls.ok)
            return fail(state, cls.code);
        combination = cls.combination;
        const hand = state.hands[actor.playerId] ?? [];
        for (const id of action.cardIds) {
            if (!hand.includes(id))
                return fail(state, 'CARD_NOT_OWNED');
        }
        if (state.lastPlay && !canBeat(combination, state.lastPlay.combination)) {
            return fail(state, 'DOES_NOT_BEAT');
        }
    }
    else {
        if (state.lastPlay === null)
            return fail(state, 'PASS_ON_FREE_LEAD');
    }
    // ---- Commit ----
    const s = copyState(state);
    const events = [];
    const pid = actor.playerId;
    if (action.type === 'PLAY' && combination) {
        const hand = s.hands[pid];
        for (const id of action.cardIds) {
            hand.splice(hand.indexOf(id), 1);
        }
        s.trickCards.push(...action.cardIds);
        s.lastPlay = { playerId: pid, combination };
        s.passedSinceLastPlay = [];
        events.push({ type: 'PLAY_ACCEPTED', playerId: pid, combination });
    }
    else {
        if (!s.passedSinceLastPlay.includes(pid))
            s.passedSinceLastPlay.push(pid);
        events.push({ type: 'PASS_ACCEPTED', playerId: pid });
    }
    // ---- Finishing ----
    if (action.type === 'PLAY' && s.hands[pid].length === 0) {
        s.finishOrder.push(pid);
        events.push({ type: 'PLAYER_FINISHED', playerId: pid, place: s.finishOrder.length });
        const remaining = activePlayers(s);
        if (remaining.length === 1) {
            // Auto-assign last place; hand ends. Preserve their cards.
            s.finishOrder.push(remaining[0]);
            events.push({
                type: 'PLAYER_FINISHED',
                playerId: remaining[0],
                place: s.finishOrder.length,
            });
            s.status = 'FINISHED';
            s.currentPlayerId = null;
            events.push({ type: 'HAND_FINISHED', finishOrder: [...s.finishOrder] });
            s.revision += 1;
            return { ok: true, state: s, events };
        }
    }
    // ---- Trick closure / turn advance ----
    const lastActor = s.lastPlay ? s.lastPlay.playerId : null;
    const responders = activePlayers(s).filter((p) => lastActor && isActive(s, lastActor) ? p !== lastActor : true);
    const allPassed = responders.every((p) => s.passedSinceLastPlay.includes(p));
    if (s.lastPlay && allPassed && responders.length > 0) {
        const closedBy = s.lastPlay.playerId;
        s.discard.push(...s.trickCards);
        s.trickCards = [];
        s.lastPlay = null;
        s.passedSinceLastPlay = [];
        const leader = isActive(s, closedBy) ? closedBy : nextActiveAfter(s, closedBy);
        events.push({ type: 'TRICK_CLOSED', leaderId: leader });
        s.currentPlayerId = leader;
    }
    else {
        s.currentPlayerId = nextActiveAfter(s, pid);
    }
    s.revision += 1;
    return { ok: true, state: s, events };
}
/** Enumerate candidate plays from a hand (bounded, correct). */
function getLegalMoves(view, playerCount) {
    const hand = view.selfHand;
    const out = [];
    const seen = new Set();
    const push = (cardIds) => {
        const key = [...cardIds].sort().join(',');
        if (seen.has(key))
            return;
        seen.add(key);
        const cls = classifyHand(cardIds, playerCount);
        if (cls.ok) {
            if (!view.lastPlay || canBeat(cls.combination, view.lastPlay.combination)) {
                out.push(cls.combination);
            }
        }
    };
    // Singles, pairs, bombs (exact, per rank)
    const byRank = new Map();
    for (const id of hand) {
        const r = id === 'SJ' || id === 'BJ' ? id : id.slice(2);
        if (!byRank.has(r))
            byRank.set(r, []);
        byRank.get(r).push(id);
    }
    for (const ids of byRank.values()) {
        push([ids[0]]); // single
        if (ids.length >= 2)
            push(ids.slice(0, 2)); // pair
        if (ids.length >= 3)
            push(ids.slice(0, 3)); // triple bomb
        if (ids.length >= 4)
            push(ids.slice(0, 4)); // four bomb
    }
    if (byRank.has('SJ') && byRank.has('BJ')) {
        push([byRank.get('SJ')[0], byRank.get('BJ')[0]]); // rocket
    }
    // Straights & pair-runs: build from rank sequences present in hand
    // Note: pair-runs have their own minimum (2) separate from straights,
    // per classifyHand which accepts two consecutive pairs as PAIR_RUN.
    const seqRanks = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const minStraight = playerCount === 3 ? 4 : 3;
    const minPairRun = 2;
    for (let len = minStraight; len <= Math.min(11, seqRanks.length); len++) {
        for (let start = 0; start + len <= seqRanks.length; start++) {
            const ranks = seqRanks.slice(start, start + len);
            if (ranks.every((r) => (byRank.get(r) ?? []).length >= 1)) {
                push(ranks.map((r) => byRank.get(r)[0]));
            }
        }
    }
    // Pair-runs enumerated separately with their own minimum length
    for (let len = minPairRun; len <= Math.min(11, seqRanks.length); len++) {
        for (let start = 0; start + len <= seqRanks.length; start++) {
            const ranks = seqRanks.slice(start, start + len);
            if (ranks.every((r) => (byRank.get(r) ?? []).length >= 2)) {
                push(ranks.flatMap((r) => byRank.get(r).slice(0, 2)));
            }
        }
    }
    return out;
}
function getPlayerView(state, playerId) {
    const placeOf = (pid) => {
        const i = state.finishOrder.indexOf(pid);
        return i >= 0 ? i + 1 : null;
    };
    return {
        rulesVersion: state.rulesVersion,
        gameId: state.gameId,
        revision: state.revision,
        selfId: playerId,
        selfHand: [...(state.hands[playerId] ?? [])],
        players: state.seatOrder.map((id) => ({
            id,
            cardCount: (state.hands[id] ?? []).length,
            place: placeOf(id),
        })),
        currentPlayerId: state.currentPlayerId,
        lastPlay: state.lastPlay
            ? {
                playerId: state.lastPlay.playerId,
                combination: {
                    ...state.lastPlay.combination,
                    cardIds: [...state.lastPlay.combination.cardIds],
                },
            }
            : null,
        passedSinceLastPlay: [...state.passedSinceLastPlay],
        finishOrder: [...state.finishOrder],
        status: state.status,
    };
}
  // Shim: keep the gdy* global name used by ui.js / game.js / gdy-engine.js.
  // getLegalMoves reads view.selfHand + view.lastPlay; wrap the decomposed args.
  globalThis.gdyFindPlays = function (handIds, target, playerCount) {
    const view = {
      selfHand: handIds,
      lastPlay: target ? { playerId: '', combination: target } : null,
    };
    return getLegalMoves(view, playerCount);
  };
})();
