'use strict';
/* GENERATED from shared/deck.ts — do not hand-edit.
 * Rebuild: node scripts/build-gdy-shared-deck.mjs
 * PR5 module 1: the client's deck functions (gdyCreateDeck/gdyCardRank/
 * gdyRankStrength/gdyShuffle/gdyBarelyShuffle) now come from the shared
 * TypeScript source instead of the hand-ported copy. */
(function () {
const SUITS = ['S', 'H', 'C', 'D'];
const NATURAL_RANKS = [
    '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3',
];
const STRENGTH = {
    '4': 0, '5': 1, '6': 2, '7': 3, '8': 4, '9': 5, '10': 6,
    'J': 7, 'Q': 8, 'K': 9, 'A': 10, '2': 11, '3': 12,
    'SJ': 13, 'BJ': 14,
};
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of NATURAL_RANKS) {
            deck.push({ id: `${suit}-${rank}`, rank, suit });
        }
    }
    deck.push({ id: 'SJ', rank: 'SJ', suit: null });
    deck.push({ id: 'BJ', rank: 'BJ', suit: null });
    return deck;
}
function cardIdToRank(id) {
    if (id === 'SJ' || id === 'BJ')
        return id;
    return id.slice(2);
}
function rankStrength(rank) {
    return STRENGTH[rank];
}
/** Round-robin deal of all 54 cards starting at startSeatIndex. */
function dealCards(deck, seats, startSeatIndex) {
    const hands = {};
    for (const s of seats)
        hands[s] = [];
    deck.forEach((cardId, i) => {
        const seat = seats[(startSeatIndex + i) % seats.length];
        hands[seat].push(cardId);
    });
    return hands;
}
/** Fisher-Yates shuffle; injectable RNG for tests. */
function shuffle(arr, rand = Math.random) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
/** Barely shuffle: only a few random swaps, so same ranks stay clumped (bombs everywhere). */
function barelyShuffle(arr, rand = Math.random) {
    const a = [...arr];
    const swaps = 8 + Math.floor(rand() * 5); // 8-12 swaps
    for (let k = 0; k < swaps; k++) {
        const i = Math.floor(rand() * a.length);
        const j = Math.floor(rand() * a.length);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
  // Shims: keep the gdy* global names used by ui.js / game.js.
  globalThis.gdyCreateDeck = function () { return createDeck(); };
  globalThis.gdyCardRank = function (id) { return cardIdToRank(id); };
  globalThis.gdyRankStrength = function (rank) { return rankStrength(rank); };
  globalThis.gdyShuffle = function (arr, rand) { return shuffle(arr, rand); };
  globalThis.gdyBarelyShuffle = function (arr, rand) { return barelyShuffle(arr, rand); };
})();
