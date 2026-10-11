import { expect } from '@playwright/test';
import { applyAction } from '../../shared/engine.js';
import { Match } from '../../server/src/match.js';
import { Room } from '../../server/src/rooms.js';
import type { ServerMsg } from '../../server/src/protocol.js';
import type { Action, CardId, DomainEvent, GameState } from '../../shared/types.js';
import { FULL_DECK, SEATS } from '../data/rule-cases.js';

/** A tiny repeatable RNG for shuffles. Seed and output never depend on wall time. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Match currently calls Math.random directly; keep the replacement synchronous and scoped. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try { return fn(); } finally { Math.random = original; }
}

/**
 * Small, physically valid endgame fixture: all unused cards live in discard.
 * This does not call production classification, dealing, or scoring to manufacture expectations.
 */
export function scenario(
  hands: Record<string, CardId[]>,
  options: Partial<Omit<GameState, 'hands' | 'playerCount' | 'seatOrder'>> = {},
): GameState {
  const seatOrder = Object.keys(hands);
  if (seatOrder.length !== 3 && seatOrder.length !== 4) throw new Error('Fixture must have 3 or 4 seats');
  const played = options.trickCards ?? [];
  const used = [...Object.values(hands).flat(), ...played];
  if (used.some(card => !FULL_DECK.includes(card)) || new Set(used).size !== used.length) {
    throw new Error('Fixture contains unknown or duplicate physical cards');
  }
  return {
    rulesVersion: 'gdy-custom-1.0.0', gameId: 'g1', handNumber: 1,
    playerCount: seatOrder.length as 3 | 4, revision: 0, seatOrder,
    hands: Object.fromEntries(Object.entries(hands).map(([pid, cards]) => [pid, [...cards]])),
    currentPlayerId: seatOrder[0], lastPlay: null, passedSinceLastPlay: [],
    trickCards: [...played], discard: FULL_DECK.filter(card => !used.includes(card)),
    finishOrder: [], status: 'PLAYING', ...options,
  };
}

export function actionFor(state: GameState, cards?: CardId[]): Action {
  const common = { actionId: `qa-${state.gameId}-${state.revision}`, gameId: state.gameId, expectedRevision: state.revision };
  return cards === undefined ? { ...common, type: 'PASS' } : { ...common, type: 'PLAY', cardIds: cards };
}

export function act(state: GameState, cards?: CardId[]): { state: GameState; events: DomainEvent[] } {
  const result = applyAction(state, actionFor(state, cards), { playerId: state.currentPlayerId!, source: 'HUMAN' });
  expect(result.ok, `Expected accepted action: ${JSON.stringify(result)}`).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result;
}

export function expectConserved(state: GameState): void {
  // lastPlay is a reference to trickCards, never a second ownership zone.
  const zones = [...Object.values(state.hands).flat(), ...state.trickCards, ...state.discard];
  expect(zones).toHaveLength(54);
  expect(new Set(zones).size).toBe(54);
  expect([...zones].sort()).toEqual([...FULL_DECK].sort());
  if (state.lastPlay) {
    for (const card of state.lastPlay.combination.cardIds) expect(state.trickCards).toContain(card);
  }
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

type GameMessage = Extract<ServerMsg, { type: 'GAME_STATE' }>;
export interface CapturedMessage { playerId: string | null; message: ServerMsg }

/** Real Room + Match, with only network delivery and real-time scheduling replaced. */
export function matchHarness(players: 3 | 4, seed = 20261011, noShuffle = false) {
  const room = new Room('QA01', players, false, noShuffle);
  room.seats = SEATS.slice(0, players).map(playerId => ({
    playerId, name: playerId, isBot: false, token: `qa-${playerId}`,
    ready: true, ws: null, connected: true, lastSeen: 0,
  }));
  room.hostId = 'p1';
  const messages: CapturedMessage[] = [];
  const copy = (msg: ServerMsg): ServerMsg => JSON.parse(JSON.stringify(msg));
  room.sendTo = (playerId, message) => { messages.push({ playerId, message: copy(message) }); };
  room.broadcast = message => { messages.push({ playerId: null, message: copy(message) }); };
  const match = new Match(room);
  // No sockets or timer callbacks run in these in-process contract tests.
  match.scheduleTurn = () => {};
  withSeed(seed, () => match.start());
  const latestView = (playerId = 'p1'): GameMessage => {
    const found = [...messages].reverse().find(item => item.playerId === playerId && item.message.type === 'GAME_STATE');
    if (!found || found.message.type !== 'GAME_STATE') throw new Error(`No GAME_STATE for ${playerId}`);
    return found.message;
  };
  const move = (cards?: CardId[], playerId = match.state!.currentPlayerId!) => {
    const previous = match.state!.revision;
    match.onAction(playerId, cards === undefined ? 'PASS' : 'PLAY', cards ?? [], previous);
    expect(match.state!.revision).toBe(previous + 1);
    expectConserved(match.state!);
  };
  return { room, match, messages, latestView, move };
}
