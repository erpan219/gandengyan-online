import { test, expect } from '@playwright/test';
import type { CardId } from '../../shared/types.js';
import { expectConserved, matchHarness, scenario, withSeed } from '../helpers/engine.js';

// Source contract: server/src/match.ts calculateScores/applyMove/dealNewHand.
// Placement: 3 seats = 2/1/0; 4 seats = 3/2/1/0. Accepted triple/four = +1, rocket = +2.
// Tests call public Match.onAction and inspect emitted GAME_STATE, never private scoring.

test.beforeEach(({}, info) => {
  info.annotations.push({ type: 'layer', description: 'actual server Match with captured messages; no browser or server deployment' });
  info.annotations.push({ type: 'reference', description: 'server/src/match.ts: calculateScores, applyMove, dealNewHand' });
});

function expectScores(harness: ReturnType<typeof matchHarness>, expected: Record<string, number>) {
  expect(harness.match.state!.status).toBe('FINISHED');
  expect(harness.room.phase).toBe('RESULTS');
  expect(harness.match.scores).toEqual(expected);
  expect(harness.latestView().scores).toEqual(expected);
  expect(harness.latestView().handScores).toEqual(expected);
}

test('SCORE-001: a new match starts with empty totals and no carried hand score', () => {
  const harness = matchHarness(3);
  expect(harness.match.scores).toEqual({});
  expect(harness.latestView().scores).toEqual({});
  expect(harness.latestView().handScores).toEqual({});
  for (const player of ['p1', 'p2', 'p3']) expect(harness.latestView().scores?.[player] ?? 0).toBe(0);
});

test('SCORE-002: three-player ordinary finish scores 2, 1, 0 with explicit zero for last', () => {
  const h = matchHarness(3);
  h.match.state = scenario({ p1: ['S-4'], p2: ['S-5'], p3: ['S-6', 'S-7'] });
  h.move(['S-4']); h.move(['S-5']);
  expectScores(h, { p1: 2, p2: 1, p3: 0 });
  expect(h.match.previousWinnerId).toBe('p1');
  expect(h.latestView().view.finishOrder).toEqual(['p1', 'p2', 'p3']);
  expect(h.latestView('p3').view.selfHand).toEqual(['S-6', 'S-7']);
});

test('SCORE-003: four-player ordinary finish scores 3, 2, 1, 0', () => {
  const h = matchHarness(4);
  h.match.state = scenario({ p1: ['S-4'], p2: ['S-5'], p3: ['S-6'], p4: ['S-7', 'S-8'] });
  h.move(['S-4']); h.move(['S-5']); h.move(['S-6']);
  expectScores(h, { p1: 3, p2: 2, p3: 1, p4: 0 });
});

test('SCORE-004: triple and final-action four bomb each earn exactly one bonus', () => {
  const h = matchHarness(3);
  h.match.state = scenario({ p1: ['S-A', 'H-A', 'C-A'], p2: ['S-4', 'H-4', 'C-4', 'D-4'], p3: ['S-5', 'S-6'] });
  h.move(['S-A', 'H-A', 'C-A']);
  expect(h.match.scores).toEqual({}); // No settlement until the whole hand ends.
  h.move(['S-4', 'H-4', 'C-4', 'D-4']);
  expectScores(h, { p1: 3, p2: 2, p3: 0 });
});

test('SCORE-005: rocket gives two bonus points after two passes and trick closure', () => {
  const h = matchHarness(3);
  h.match.state = scenario({ p1: ['SJ', 'BJ'], p2: ['S-4'], p3: ['S-5', 'S-6'] });
  h.move(['SJ', 'BJ']); h.move(); h.move();
  expect(h.match.state!.currentPlayerId).toBe('p2');
  expect(h.match.state!.lastPlay).toBeNull();
  h.move(['S-4']);
  expectScores(h, { p1: 4, p2: 1, p3: 0 });
});

test('SCORE-006: a rocket that ends the hand is counted before score calculation', () => {
  const h = matchHarness(3);
  h.match.state = scenario({ p1: ['S-4'], p2: ['SJ', 'BJ'], p3: ['S-5', 'S-6'] });
  h.move(['S-4']); h.move(['SJ', 'BJ']);
  expectScores(h, { p1: 2, p2: 3, p3: 0 });
});

test('SCORE-007: four-player chain counts triple, four bomb, and last-action rocket', () => {
  const h = matchHarness(4);
  h.match.state = scenario({ p1: ['S-A', 'H-A', 'C-A'], p2: ['S-4', 'H-4', 'C-4', 'D-4'], p3: ['SJ', 'BJ'], p4: ['S-5', 'S-6'] });
  h.move(['S-A', 'H-A', 'C-A']); h.move(['S-4', 'H-4', 'C-4', 'D-4']); h.move(['SJ', 'BJ']);
  expectScores(h, { p1: 4, p2: 3, p3: 3, p4: 0 });
});

test('SCORE-008: a rejected lower bomb never contributes bonus points', () => {
  const h = matchHarness(3);
  h.match.state = scenario({ p1: ['S-A', 'H-A', 'C-A', 'S-4'], p2: ['S-6', 'H-6', 'C-6'], p3: ['S-5', 'S-7'] });
  h.move(['S-A', 'H-A', 'C-A']);
  const revision = h.match.state!.revision;
  h.match.onAction('p2', 'PLAY', ['S-6', 'H-6', 'C-6'], revision);
  expect(h.match.state!.revision).toBe(revision);
  expect(h.messages.at(-1)).toMatchObject({ playerId: 'p2', message: { type: 'ERROR', code: 'DOES_NOT_BEAT' } });
  h.move(); h.move(); // p2/p3 pass, p1 regains lead.
  h.move(['S-4']); h.move(['S-6', 'H-6', 'C-6']);
  expectScores(h, { p1: 3, p2: 2, p3: 0 });
});

test('SCORE-009: repeated action and reconnect after settlement do not score twice', () => {
  const h = matchHarness(3);
  h.match.state = scenario({ p1: ['S-4'], p2: ['SJ', 'BJ'], p3: ['S-5', 'S-6'] });
  h.move(['S-4']);
  const oldRevision = h.match.state!.revision;
  h.move(['SJ', 'BJ']);
  h.match.onAction('p2', 'PLAY', ['SJ', 'BJ'], oldRevision);
  h.match.onReconnect('p2'); h.match.onReconnect('p1');
  expectScores(h, { p1: 2, p2: 3, p3: 0 });
  expect(h.match.state!.revision).toBe(2);
});

test('SCORE-010: multiple accepted bombs by one player accumulate once each', () => {
  const h = matchHarness(3);
  h.match.state = scenario({
    p1: ['S-4', 'H-4', 'C-4', 'S-5', 'H-5', 'C-5'],
    p2: ['S-6'], p3: ['S-7', 'S-8'],
  });
  h.move(['S-4', 'H-4', 'C-4']); h.move(); h.move();
  h.move(['S-5', 'H-5', 'C-5']); h.move(); h.move();
  h.move(['S-6']);
  expectScores(h, { p1: 4, p2: 1, p3: 0 });
});

test('ROUND-001: next hand keeps totals, advances game identity, and uses previous winner as leader', () => {
  const h = matchHarness(3);
  h.match.state = scenario({ p1: ['S-6', 'S-7'], p2: ['S-4'], p3: ['S-5'] }, { currentPlayerId: 'p2' });
  h.move(['S-4']); h.move(['S-5']);
  expectScores(h, { p2: 2, p3: 1, p1: 0 });
  withSeed(17, () => h.match.nextHand());
  expect(h.match.state).toMatchObject({ gameId: 'g2', handNumber: 2, revision: 0, currentPlayerId: 'p2',
    status: 'PLAYING', finishOrder: [], lastPlay: null, trickCards: [], discard: [], passedSinceLastPlay: [] });
  expect(h.match.previousWinnerId).toBe('p2');
  expect(h.room.phase).toBe('PLAYING');
  expect(h.match.scores).toEqual({ p2: 2, p3: 1, p1: 0 });
  expect(h.latestView().scores).toEqual({ p2: 2, p3: 1, p1: 0 });
  expect(Object.values(h.match.state!.hands).map(cards => cards.length)).toEqual([18, 18, 18]);
  expectConserved(h.match.state!);
});

test('ROUND-002: two hand totals add independently while displayed hand score is only the latest hand', () => {
  const h = matchHarness(3);
  h.match.state = scenario({ p1: ['S-4'], p2: ['S-5'], p3: ['S-6', 'S-7'] });
  h.move(['S-4']); h.move(['S-5']);
  withSeed(18, () => h.match.nextHand());
  h.match.state = scenario({ p1: ['S-6', 'S-7'], p2: ['S-4'], p3: ['S-5'] }, { gameId: 'g2', handNumber: 2, currentPlayerId: 'p2' });
  h.move(['S-4']); h.move(['S-5']);
  expect(h.match.scores).toEqual({ p1: 2, p2: 3, p3: 1 });
  expect(h.latestView().scores).toEqual({ p1: 2, p2: 3, p3: 1 });
  expect(h.latestView().handScores).toEqual({ p2: 2, p3: 1, p1: 0 });
  expect(h.match.previousWinnerId).toBe('p2');
  expect(h.latestView().handNumber).toBe(2);
});

test('ROUND-003: bomb counters reset at nextHand and cannot leak a prior bonus', () => {
  const h = matchHarness(3);
  h.match.state = scenario({ p1: ['S-4', 'H-4', 'C-4'], p2: ['S-5'], p3: ['S-6', 'S-7'] });
  h.move(['S-4', 'H-4', 'C-4']); h.move(); h.move(); h.move(['S-5']);
  expectScores(h, { p1: 3, p2: 1, p3: 0 });
  withSeed(19, () => h.match.nextHand());
  h.match.state = scenario({ p1: ['S-4'], p2: ['S-5'], p3: ['S-6', 'S-7'] }, { gameId: 'g2', handNumber: 2 });
  h.move(['S-4']); h.move(['S-5']);
  expect(h.latestView().handScores).toEqual({ p1: 2, p2: 1, p3: 0 });
  expect(h.match.scores).toEqual({ p1: 5, p2: 2, p3: 0 });
});

test('ROUND-004: four-seat next deal rotates both extra cards to winner and following seat', () => {
  const h = matchHarness(4);
  h.match.state = scenario({ p1: ['S-8', 'S-9'], p2: ['S-4'], p3: ['S-5'], p4: ['S-6'] }, { currentPlayerId: 'p2' });
  h.move(['S-4']); h.move(['S-5']); h.move(['S-6']);
  expectScores(h, { p2: 3, p3: 2, p4: 1, p1: 0 });
  withSeed(20, () => h.match.nextHand());
  expect(h.match.state!.currentPlayerId).toBe('p2');
  expect(Object.values(h.match.state!.hands).map(cards => cards.length)).toEqual([13, 14, 14, 13]);
  expectConserved(h.match.state!);
});

test('ROUND-005: old-hand game ID is rejected even when revision numerically matches', async () => {
  // This boundary belongs to applyAction; the network server generates gameId internally.
  const { applyAction } = await import('../../shared/engine.js');
  const h = matchHarness(3);
  withSeed(21, () => h.match.nextHand());
  const state = h.match.state!;
  const card = state.hands[state.currentPlayerId!][0] as CardId;
  const result = applyAction(state, { type: 'PLAY', actionId: 'old-g1-action', gameId: 'g1', expectedRevision: 0, cardIds: [card] },
    { playerId: state.currentPlayerId!, source: 'HUMAN' });
  expect(result).toEqual({ ok: false, code: 'WRONG_GAME', state });
  expect(h.match.scores).toEqual({});
});
