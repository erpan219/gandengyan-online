import { test, expect } from '@playwright/test';
import { classifyHand, canBeat } from '../../shared/classify.js';
import { createDeck, dealCards, rankStrength, shuffle } from '../../shared/deck.js';
import { applyAction, getLegalMoves, getPlayerView, newHand, nextActiveAfter } from '../../shared/engine.js';
import { chooseBotMove } from '../../shared/bot.js';
import type { CardId, Combination, GameState, RuleError } from '../../shared/types.js';
import { BEAT_CASES, CLASSIFICATION_CASES, FULL_DECK, RANK_ORDER, SEATS } from '../data/rule-cases.js';
import { act, actionFor, deepFreeze, expectConserved, matchHarness, scenario, seededRandom } from '../helpers/engine.js';

// These tests execute the repository's TypeScript modules, not a QA reimplementation.
// Reference: shared/{types,deck,classify,engine,bot}.ts; server/src/match.ts.

test.beforeEach(({}, info) => {
  info.annotations.push({ type: 'layer', description: 'actual shared TypeScript engine / in-process server Match' });
  info.annotations.push({ type: 'rules', description: 'gdy-custom-1.0.0; independent goldens in qa/data/rule-cases.ts' });
});

test.describe('Classification: every allowed play type and invalid boundaries', () => {
  for (const entry of CLASSIFICATION_CASES) {
    test(`${entry.id}: ${entry.description}`, () => {
      const cards = [...entry.cards];
      const result = classifyHand(cards, entry.players);
      if ('error' in entry.expected) {
        expect(result).toEqual({ ok: false, code: entry.expected.error });
      } else {
        expect(result).toEqual({ ok: true, combination: {
          kind: entry.expected.kind, cardIds: entry.cards,
          cardCount: entry.expected.count, strength: entry.expected.strength,
        } });
        if (result.ok) expect(result.combination.cardIds).not.toBe(cards);
      }
      expect(cards).toEqual(entry.cards);
    });
  }

  test('RULE-031: all 15 rank strengths use the custom rank order', () => {
    for (let index = 0; index < RANK_ORDER.length; index++) {
      const rank = RANK_ORDER[index];
      expect(rankStrength(rank)).toBe(index);
      const card = (rank === 'SJ' || rank === 'BJ' ? rank : `S-${rank}`) as CardId;
      expect(classifyHand([card], 3)).toMatchObject({ ok: true, combination: { kind: 'SINGLE', strength: index } });
    }
  });

  test('RULE-032: maximum pair run contains exactly two of all 11 sequence ranks', () => {
    const cards: CardId[] = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
      .flatMap(rank => [`S-${rank}`, `H-${rank}`] as CardId[]);
    expect(classifyHand(cards, 3)).toEqual({ ok: true, combination: { kind: 'PAIR_RUN', cardIds: cards, cardCount: 22, strength: 0 } });
  });
});

test.describe('Comparison: strict rank, equal size, and bomb hierarchy', () => {
  for (const entry of BEAT_CASES) {
    test(`${entry.id}: ${entry.description}`, () => {
      const combination = ([kind, cardCount, strength]: typeof entry.candidate): Combination => ({ kind, cardCount, strength, cardIds: [] });
      // canBeat's public contract compares metadata; these independent constants avoid
      // masking a classifyHand regression with output from the same classifier.
      expect(canBeat(combination(entry.candidate), combination(entry.target))).toBe(entry.beats);
    });
  }
});

test.describe('Deck, deal, and initial turn', () => {
  test('DEAL-001: deck has exactly 52 natural cards and two distinct jokers', () => {
    const deck = createDeck();
    expect(deck.map(card => card.id)).toEqual(FULL_DECK);
    expect(new Set(deck.map(card => card.id)).size).toBe(54);
    expect(deck.filter(card => card.suit === null)).toEqual([
      { id: 'SJ', rank: 'SJ', suit: null }, { id: 'BJ', rank: 'BJ', suit: null },
    ]);
    for (const suit of ['S', 'H', 'C', 'D']) expect(deck.filter(card => card.suit === suit)).toHaveLength(13);
  });

  test('DEAL-002: shuffle accepts a seed, preserves cards, and does not mutate input', () => {
    const input = [...FULL_DECK];
    const first = shuffle(input, seededRandom(12345));
    expect(first).toEqual(shuffle(input, seededRandom(12345)));
    expect(first).not.toEqual(shuffle(input, seededRandom(54321)));
    expect([...first].sort()).toEqual([...FULL_DECK].sort());
    expect(input).toEqual(FULL_DECK);
    // Constant RNG is an independent, manually predictable Fisher-Yates oracle.
    expect(shuffle(['a', 'b', 'c', 'd'], () => 0)).toEqual(['b', 'c', 'd', 'a']);
  });

  for (const players of [3, 4] as const) {
    for (let start = 0; start < players; start++) {
      test(`DEAL-00${players}-${start}: ${players} seats, deal starts at seat ${start}`, () => {
        const seats = [...SEATS.slice(0, players)];
        const hands = dealCards([...FULL_DECK], seats, start);
        expect(Object.values(hands).map(cards => cards.length)).toEqual(
          players === 3 ? [18, 18, 18] : Array.from({ length: 4 }, (_, index) =>
            (index - start + 4) % 4 < 2 ? 14 : 13),
        );
        // Explicit round-robin positions; no production dealer used for expected ownership.
        FULL_DECK.forEach((card, index) => expect(hands[seats[(start + index) % players]]).toContain(card));
        expect(Object.values(hands).flat().sort()).toEqual([...FULL_DECK].sort());
      });
    }

    test(`START-001-${players}: newHand starts with the supplied leader and clean state`, () => {
      const state = newHand([...SEATS.slice(0, players)], players, 7, 'p2', [...FULL_DECK], 1);
      expect(state).toMatchObject({ rulesVersion: 'gdy-custom-1.0.0', gameId: 'g7', handNumber: 7,
        revision: 0, currentPlayerId: 'p2', lastPlay: null, trickCards: [], discard: [],
        passedSinceLastPlay: [], finishOrder: [], status: 'PLAYING' });
      expectConserved(state);
    });

    for (const seed of [1, 42, 20261011]) {
      test(`START-002-${players}-${seed}: actual Match first leader holds S-4`, () => {
        const { match, room, messages } = matchHarness(players, seed);
        const state = match.state!;
        expect(state.hands[state.currentPlayerId!]).toContain('S-4');
        expect(state.currentPlayerId).toBe(Object.entries(state.hands).find(([, cards]) => cards.includes('S-4'))![0]);
        expect(state.handNumber).toBe(1);
        expect(room.phase).toBe('PLAYING');
        expect(messages[0].message.type).toBe('ROOM_STATE');
        expect(messages.filter(item => item.message.type === 'GAME_STATE')).toHaveLength(players);
        expectConserved(state);
      });
    }
  }

  test('START-003: noShuffle mode still deals all cards and chooses the S-4 holder', () => {
    const { match } = matchHarness(4, 7, true);
    expectConserved(match.state!);
    expect(match.state!.hands[match.state!.currentPlayerId!]).toContain('S-4');
    expect(Object.values(match.state!.hands).map(hand => hand.length)).toEqual([14, 14, 13, 13]);
  });
});

test.describe('Engine validation is atomic', () => {
  const cases: Array<{ id: string; error: RuleError; cards?: CardId[]; actor?: string; mutate?: (state: GameState) => void; actionPatch?: Record<string, unknown> }> = [
    { id: 'VALID-001', error: 'EMPTY_SELECTION', cards: [] },
    { id: 'VALID-002', error: 'DUPLICATE_CARD', cards: ['S-4', 'S-4'] },
    { id: 'VALID-003', error: 'UNKNOWN_CARD', cards: ['S-1' as CardId] },
    { id: 'VALID-004', error: 'CARD_NOT_OWNED', cards: ['D-3'] },
    { id: 'VALID-005', error: 'INVALID_COMBINATION', cards: ['S-4', 'S-6'] },
    { id: 'VALID-006', error: 'NOT_YOUR_TURN', cards: ['S-4'], actor: 'p2' },
    { id: 'VALID-007', error: 'STALE_REVISION', cards: ['S-4'], actionPatch: { expectedRevision: -1 } },
    { id: 'VALID-008', error: 'WRONG_GAME', cards: ['S-4'], actionPatch: { gameId: 'old-hand' } },
    { id: 'VALID-009', error: 'HAND_NOT_PLAYING', cards: ['S-4'], mutate: state => { state.status = 'FINISHED'; } },
    { id: 'VALID-010', error: 'HAND_NOT_PLAYING', cards: ['S-4'], mutate: state => { state.status = 'INTERRUPTED'; } },
    { id: 'VALID-011', error: 'PASS_ON_FREE_LEAD' },
    { id: 'VALID-012', error: 'DOES_NOT_BEAT', cards: ['S-4'], mutate: state => {
      state.lastPlay = { playerId: 'p3', combination: { kind: 'SINGLE', cardIds: ['H-A'], cardCount: 1, strength: 10 } };
      state.discard = state.discard.filter(card => card !== 'H-A'); state.trickCards = ['H-A'];
    } },
  ];
  for (const entry of cases) {
    test(`${entry.id}: ${entry.error} leaves state and revision unchanged`, () => {
      const state = scenario({ p1: ['S-4', 'S-6'], p2: ['S-5'], p3: ['S-7'] });
      entry.mutate?.(state);
      const before = structuredClone(state);
      const action = { ...actionFor(state, entry.cards), ...entry.actionPatch } as ReturnType<typeof actionFor>;
      deepFreeze(state); deepFreeze(action);
      const result = applyAction(state, action, { playerId: entry.actor ?? 'p1', source: 'HUMAN' });
      expect(result).toEqual({ ok: false, code: entry.error, state: before });
      expect(result.state).toBe(state);
      expect(state).toEqual(before);
      expectConserved(state);
    });
  }

  test('VALID-013: duplicate/stale action cannot remove cards twice', () => {
    const initial = scenario({ p1: ['S-4', 'S-6'], p2: ['S-5'], p3: ['S-7'] });
    const action = actionFor(initial, ['S-4']);
    const accepted = applyAction(initial, action, { playerId: 'p1', source: 'HUMAN' });
    expect(accepted.ok).toBe(true);
    const replay = applyAction(accepted.state, action, { playerId: 'p1', source: 'HUMAN' });
    expect(replay).toEqual({ ok: false, code: 'STALE_REVISION', state: accepted.state });
    expect(replay.state.hands.p1).toEqual(['S-6']);
    expect(replay.state.revision).toBe(1);
    expectConserved(replay.state);
  });

  test('VALID-014: accepted action clones mutable state and increments revision exactly once', () => {
    const initial = scenario({ p1: ['S-4', 'S-6'], p2: ['S-5'], p3: ['S-7'] });
    const before = structuredClone(initial); deepFreeze(initial);
    const result = act(initial, ['S-4']);
    expect(initial).toEqual(before);
    expect(result.state).not.toBe(initial);
    expect(result.state.revision).toBe(1);
    expect(result.state.hands.p1).toEqual(['S-6']);
    expect(result.state.currentPlayerId).toBe('p2');
    expect(result.events).toEqual([{ type: 'PLAY_ACCEPTED', playerId: 'p1', combination: { kind: 'SINGLE', cardIds: ['S-4'], cardCount: 1, strength: 0 } }]);
    expectConserved(result.state);
  });
});

test.describe('Turn order, passes, finishing and privacy', () => {
  test('TURN-001: all responders pass, trick closes and active last player leads', () => {
    let state = scenario({ p1: ['S-4', 'S-6'], p2: ['S-5'], p3: ['S-7'] });
    state = act(state, ['S-4']).state;
    state = act(state).state;
    expect(state.currentPlayerId).toBe('p3');
    expect(state.passedSinceLastPlay).toEqual(['p2']);
    const closed = act(state);
    expect(closed.events).toEqual([{ type: 'PASS_ACCEPTED', playerId: 'p3' }, { type: 'TRICK_CLOSED', leaderId: 'p1' }]);
    expect(closed.state).toMatchObject({ currentPlayerId: 'p1', lastPlay: null, trickCards: [], passedSinceLastPlay: [], revision: 3 });
    expect(closed.state.discard).toContain('S-4');
    expectConserved(closed.state);
  });

  test('TURN-002: new beating play resets passes and a prior passer can respond again', () => {
    let state = scenario({ p1: ['S-4', 'S-9'], p2: ['S-6', 'S-10'], p3: ['S-5', 'S-J'] });
    state = act(state, ['S-4']).state;
    state = act(state).state; // p2 passes
    state = act(state, ['S-5']).state; // p3 beats
    expect(state.passedSinceLastPlay).toEqual([]);
    state = act(state).state; // p1 passes
    expect(state.currentPlayerId).toBe('p2');
    state = act(state, ['S-6']).state;
    expect(state.lastPlay?.playerId).toBe('p2');
    expect(state.passedSinceLastPlay).toEqual([]);
    expectConserved(state);
  });

  test('TURN-003: finished leader is skipped and next active player gets free lead', () => {
    let state = scenario({ p1: ['S-4'], p2: ['S-5', 'S-9'], p3: ['S-6', 'S-10'], p4: ['S-7', 'S-J'] });
    state = act(state, ['S-4']).state;
    expect(state.finishOrder).toEqual(['p1']);
    expect(nextActiveAfter(state, 'p4')).toBe('p2');
    state = act(state).state;
    state = act(state).state;
    const result = act(state);
    expect(result.state.currentPlayerId).toBe('p2');
    expect(result.state.lastPlay).toBeNull();
    expect(result.events).toContainEqual({ type: 'TRICK_CLOSED', leaderId: 'p2' });
    expectConserved(result.state);
  });

  test('TURN-004: second finisher ends three-player hand and preserves last player cards', () => {
    let state = scenario({ p1: ['S-4'], p2: ['S-5'], p3: ['S-6', 'S-7'] });
    state = act(state, ['S-4']).state;
    const result = act(state, ['S-5']);
    expect(result.state).toMatchObject({ status: 'FINISHED', currentPlayerId: null, finishOrder: ['p1', 'p2', 'p3'], revision: 2 });
    expect(result.state.hands.p3).toEqual(['S-6', 'S-7']);
    expect(result.events.map(event => event.type)).toEqual(['PLAY_ACCEPTED', 'PLAYER_FINISHED', 'PLAYER_FINISHED', 'HAND_FINISHED']);
    expect(result.events).toContainEqual({ type: 'PLAYER_FINISHED', playerId: 'p3', place: 3 });
    expect(result.events).toContainEqual({ type: 'HAND_FINISHED', finishOrder: ['p1', 'p2', 'p3'] });
    expectConserved(result.state);
  });

  test('TURN-005: third finisher ends four-player hand; no skipped or duplicated place', () => {
    let state = scenario({ p1: ['S-4'], p2: ['S-5'], p3: ['S-6'], p4: ['S-7', 'S-8'] });
    state = act(state, ['S-4']).state;
    state = act(state, ['S-5']).state;
    expect(state.status).toBe('PLAYING');
    state = act(state, ['S-6']).state;
    expect(state.finishOrder).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(state.status).toBe('FINISHED');
    expect(state.currentPlayerId).toBeNull();
    expect(state.hands.p4).toEqual(['S-7', 'S-8']);
    expectConserved(state);
  });

  test('VIEW-001: player view exposes only own cards and cannot mutate engine state', () => {
    let state = scenario({ p1: ['S-4', 'S-9'], p2: ['S-5', 'S-10'], p3: ['S-6', 'S-J'] });
    state = act(state, ['S-4']).state;
    const before = structuredClone(state);
    const view = getPlayerView(state, 'p2');
    expect(view.selfId).toBe('p2');
    expect(view.selfHand).toEqual(['S-5', 'S-10']);
    expect(view.players).toEqual([{ id: 'p1', cardCount: 1, place: null }, { id: 'p2', cardCount: 2, place: null }, { id: 'p3', cardCount: 2, place: null }]);
    expect(Object.keys(view).sort()).toEqual(['rulesVersion', 'gameId', 'revision', 'selfId', 'selfHand', 'players', 'currentPlayerId', 'lastPlay', 'passedSinceLastPlay', 'finishOrder', 'status'].sort());
    expect(JSON.stringify(view)).not.toContain('S-9');
    expect(JSON.stringify(view)).not.toContain('S-J');
    view.selfHand.length = 0; view.players[0].cardCount = 99;
    view.lastPlay!.combination.cardIds.length = 0; view.passedSinceLastPlay.push('p3'); view.finishOrder.push('p2');
    expect(state).toEqual(before);
  });
});

test.describe('Legal move discovery and seeded complete games', () => {
  test('MOVES-001: legal moves include the minimum two-pair run in three-player mode', () => {
    const state = scenario({ p1: ['S-4', 'H-4', 'S-5', 'H-5'], p2: ['S-6'], p3: ['S-7'] });
    const moves = getLegalMoves(getPlayerView(state, 'p1'), 3);
    expect(moves.map(move => `${move.kind}:${move.cardCount}:${move.strength}`).sort()).toEqual([
      'PAIR:2:0', 'PAIR:2:1', 'PAIR_RUN:4:0', 'SINGLE:1:0', 'SINGLE:1:1',
    ].sort());
  });

  test('MOVES-002: enumerates all seven categories with owned, nonduplicated cards', () => {
    const hand: CardId[] = ['S-4', 'H-4', 'C-4', 'D-4', 'S-5', 'H-5', 'S-6', 'H-6', 'S-7', 'SJ', 'BJ'];
    const state = scenario({ p1: hand, p2: ['S-8'], p3: ['S-9'] });
    const moves = getLegalMoves(getPlayerView(state, 'p1'), 3);
    expect([...new Set(moves.map(move => move.kind))].sort()).toEqual(['SINGLE', 'PAIR', 'STRAIGHT', 'PAIR_RUN', 'TRIPLE_BOMB', 'FOUR_BOMB', 'ROCKET'].sort());
    const keys = moves.map(move => [...move.cardIds].sort().join(','));
    expect(new Set(keys).size).toBe(moves.length);
    for (const move of moves) {
      expect(move.cardIds.every(card => hand.includes(card))).toBe(true);
      expect(new Set(move.cardIds).size).toBe(move.cardCount);
    }
  });

  test('MOVES-003: ace-triple target never offers the lower six-triple regression', () => {
    const state = scenario({ p1: ['S-6', 'H-6', 'C-6', 'S-2', 'H-2', 'C-2', 'D-4'], p2: ['S-5'], p3: ['S-7'] }, {
      lastPlay: { playerId: 'p3', combination: { kind: 'TRIPLE_BOMB', cardIds: ['S-A', 'H-A', 'C-A'], cardCount: 3, strength: 10 } },
      trickCards: ['S-A', 'H-A', 'C-A'],
    });
    expect(getLegalMoves(getPlayerView(state, 'p1'), 3)).toEqual([
      { kind: 'TRIPLE_BOMB', cardIds: ['S-2', 'H-2', 'C-2'], cardCount: 3, strength: 11 },
    ]);
  });

  test('MOVES-004: no ordinary response to rocket; bot passes', () => {
    const state = scenario({ p1: ['S-3', 'H-3', 'C-3', 'D-3'], p2: ['S-4'], p3: ['S-5'] }, {
      lastPlay: { playerId: 'p3', combination: { kind: 'ROCKET', cardIds: ['SJ', 'BJ'], cardCount: 2, strength: 0 } },
      trickCards: ['SJ', 'BJ'],
    });
    expect(getLegalMoves(getPlayerView(state, 'p1'), 3)).toEqual([]);
    expect(chooseBotMove(getPlayerView(state, 'p1'), 3)).toEqual({ type: 'PASS' });
  });

  for (const players of [3, 4] as const) {
    for (const seed of [11, 77, 20261011]) {
      test(`GAME-001-${players}-${seed}: seeded actual bot/engine game terminates and conserves all 54 cards`, () => {
        const { match } = matchHarness(players, seed);
        let state = match.state!;
        let accepted = 0;
        while (state.status === 'PLAYING' && accepted < 2000) {
          const previous = state;
          const current = state.currentPlayerId!;
          const move = chooseBotMove(getPlayerView(state, current), players);
          state = act(state, move.type === 'PLAY' ? move.cardIds : undefined).state;
          accepted++;
          expect(state.revision).toBe(previous.revision + 1);
          expect(state.finishOrder.slice(0, previous.finishOrder.length)).toEqual(previous.finishOrder);
          expectConserved(state);
        }
        expect(state.status, 'A complete game must finish within 2000 accepted actions').toBe('FINISHED');
        expect(state.currentPlayerId).toBeNull();
        expect(state.finishOrder).toHaveLength(players);
        expect([...state.finishOrder].sort()).toEqual([...SEATS.slice(0, players)]);
        for (const player of state.finishOrder.slice(0, -1)) expect(state.hands[player]).toEqual([]);
        expect(state.hands[state.finishOrder[players - 1]].length).toBeGreaterThan(0);
      });
    }
  }
});

test.describe('Every play type commits through the actual action engine', () => {
  for (const kind of ['SINGLE', 'PAIR', 'STRAIGHT', 'PAIR_RUN', 'TRIPLE_BOMB', 'FOUR_BOMB', 'ROCKET'] as const) {
    test(`PLAY-${kind}: accepted free lead removes the exact selected cards`, () => {
      const entry = CLASSIFICATION_CASES.find(item => !('error' in item.expected) && item.expected.kind === kind)!;
      if ('error' in entry.expected) throw new Error('Expected a valid golden case');
      const remaining = FULL_DECK.filter(card => !entry.cards.includes(card));
      const hands: Record<string, CardId[]> = { p1: [...entry.cards, remaining[0]], p2: [remaining[1]], p3: [remaining[2]] };
      if (entry.players === 4) hands.p4 = [remaining[3]];
      const state = scenario(hands);
      const result = act(state, entry.cards);
      expect(result.state.hands.p1).toEqual([remaining[0]]);
      expect(result.state.lastPlay).toEqual({ playerId: 'p1', combination: {
        kind, cardIds: entry.cards, cardCount: entry.expected.count, strength: entry.expected.strength,
      } });
      expect(result.state.trickCards).toEqual(entry.cards);
      expect(result.state.currentPlayerId).toBe('p2');
      expect(result.state.revision).toBe(1);
      expectConserved(result.state);
    });
  }
});

test.describe('Shipped browser engine agrees with independent rule goldens', () => {
  for (const entry of CLASSIFICATION_CASES) {
    test(`CLIENT-${entry.id}: ${entry.description}`, async () => {
      const { loadBrowserEngine, BROWSER_ERROR_CODES } = await import('../helpers/engine-client.js');
      const browser = loadBrowserEngine();
      const actual = browser.classify([...entry.cards], entry.players);
      if ('error' in entry.expected) {
        const expectedCode = BROWSER_ERROR_CODES[entry.expected.error as keyof typeof BROWSER_ERROR_CODES];
        expect(expectedCode, 'Each client error spelling must be explicitly documented').toBeDefined();
        expect(actual).toEqual({ ok: false, code: expectedCode });
        expect(classifyHand(entry.cards, entry.players)).toEqual({ ok: false, code: entry.expected.error });
      } else {
        const expected = { ok: true, combination: { kind: entry.expected.kind, cardIds: entry.cards,
          cardCount: entry.expected.count, strength: entry.expected.strength } };
        expect(actual).toEqual(expected);
        expect(classifyHand(entry.cards, entry.players)).toEqual(expected);
      }
    });
  }

  for (const entry of BEAT_CASES) {
    test(`CLIENT-${entry.id}: ${entry.description}`, async () => {
      const { loadBrowserEngine } = await import('../helpers/engine-client.js');
      const browser = loadBrowserEngine();
      const combo = ([kind, cardCount, strength]: typeof entry.candidate): Combination => ({ kind, cardCount, strength, cardIds: [] });
      expect(browser.canBeat(combo(entry.candidate), combo(entry.target))).toBe(entry.beats);
      expect(canBeat(combo(entry.candidate), combo(entry.target))).toBe(entry.beats);
    });
  }

  test('CLIENT-MOVES-001: both engines include minimum pair runs and all seven categories', async () => {
    const { loadBrowserEngine } = await import('../helpers/engine-client.js');
    const browser = loadBrowserEngine();
    const hand: CardId[] = ['S-4', 'H-4', 'C-4', 'D-4', 'S-5', 'H-5', 'S-6', 'H-6', 'S-7', 'SJ', 'BJ'];
    const state = scenario({ p1: hand, p2: ['S-8'], p3: ['S-9'] });
    const signature = (move: Combination) => `${move.kind}:${move.cardCount}:${move.strength}:${[...move.cardIds].sort().join(',')}`;
    const client = browser.findPlays(hand, null, 3);
    expect([...new Set(client.map(move => move.kind))].sort()).toEqual(['SINGLE', 'PAIR', 'STRAIGHT', 'PAIR_RUN', 'TRIPLE_BOMB', 'FOUR_BOMB', 'ROCKET'].sort());
    expect(client).toContainEqual({ kind: 'PAIR_RUN', cardIds: ['S-4', 'H-4', 'S-5', 'H-5'], cardCount: 4, strength: 0 });
    expect(client.map(signature).sort()).toEqual(getLegalMoves(getPlayerView(state, 'p1'), 3).map(signature).sort());
  });

  test('CLIENT-HINT-001: actual shipped hint never returns the lower six-triple against an ace-triple', async () => {
    const { loadBrowserEngine } = await import('../helpers/engine-client.js');
    const browser = loadBrowserEngine(101);
    const hand: CardId[] = ['S-6', 'H-6', 'C-6', 'S-2', 'H-2', 'C-2', 'D-4'];
    const target: Combination = { kind: 'TRIPLE_BOMB', cardIds: ['S-A', 'H-A', 'C-A'], cardCount: 3, strength: 10 };
    const legal = { kind: 'TRIPLE_BOMB', cardIds: ['S-2', 'H-2', 'C-2'], cardCount: 3, strength: 11 };
    expect(browser.findPlays(hand, target, 3)).toEqual([legal]);
    for (let index = 0; index < 7; index++) {
      const hint = browser.hint(hand, target, 3, [2, 6]);
      expect(hint).toEqual(['S-2', 'H-2', 'C-2']);
      expect(classifyHand(hint!, 3)).toEqual({ ok: true, combination: legal });
    }
  });

  test('UI-NORMALIZER-001: shipped uiKindToGdy tolerates both bomb spellings', async () => {
    const { loadUiKindToGdy } = await import('../helpers/engine-client.js');
    const uiKindToGdy = loadUiKindToGdy();
    // Ported from qa-regression/bomb-kind-repro.mjs (retired): the GDY-UI-BOMB-01
    // normalizer contract — adapters may emit either spelling.
    const cases: Array<[unknown, string]> = [
      ['single', 'SINGLE'], ['pair', 'PAIR'], ['straight', 'STRAIGHT'], ['pair_run', 'PAIR_RUN'],
      ['triplebomb', 'TRIPLE_BOMB'], ['triple_bomb', 'TRIPLE_BOMB'],
      ['fourbomb', 'FOUR_BOMB'], ['four_bomb', 'FOUR_BOMB'], ['rocket', 'ROCKET'],
      ['SINGLE', 'SINGLE'], ['TripleBomb', 'TRIPLE_BOMB'], // case-insensitive
      ['nonsense', 'SINGLE'], [undefined, 'SINGLE'], // unknown falls back to SINGLE
    ];
    for (const [input, expected] of cases) {
      expect(uiKindToGdy(input)).toBe(expected);
    }
  });
});
