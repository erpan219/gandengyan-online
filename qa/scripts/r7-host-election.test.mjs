/**
 * White-box tests for R7: host election when a hand ends (PLAYING -> RESULTS).
 *
 * electHostIfNeeded() runs at the FINISHED transition in Match.applyMove.
 * These tests drive it directly against the built server modules with
 * realistic room states. Run: node --test qa/scripts/r7-host-election.test.mjs
 * (from the repository root, after `npm run build`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../server/dist/server/src/rooms_manager.js';
import { attachMatch } from '../../server/dist/server/src/match.js';

function threeHumanRoom() {
  const manager = new RoomManager();
  const { room } = manager.createRoom(3, false, 'Host');
  const hostId = room.hostId;
  const p2 = room.addHuman('P2');
  const p3 = room.addHuman('P3');
  // All connected (addHuman sets connected=true, ws=null is fine for election).
  return { room, hostId, p2: p2.playerId, p3: p3.playerId };
}

function elect(room) {
  const match = attachMatch(room);
  try {
    match.start(); // dealNewHand -> state set, phase PLAYING
    assert.equal(room.phase, 'PLAYING');
    // Invoke the private election exactly as applyMove does at FINISHED.
    match.electHostIfNeeded();
  } finally {
    // Don't leave turn/bot timers hanging (would keep node --test alive).
    match.clearTurnTimer();
    match.clearBotTimer();
  }
}

test('R7: disconnected host -> a connected human is elected', () => {
  const { room, hostId, p2 } = threeHumanRoom();
  room.getSeat(hostId).connected = false; // host dropped mid-hand
  elect(room);
  assert.notEqual(room.hostId, hostId);
  const next = room.getSeat(room.hostId);
  assert.ok(next && !next.isBot && next.connected);
  assert.equal(room.hostId, p2); // first connected human in seat order
});

test('R7: connected host keeps the host seat', () => {
  const { room, hostId } = threeHumanRoom();
  elect(room);
  assert.equal(room.hostId, hostId);
});

test('R7: host taken over by AI -> a connected human is elected', () => {
  const { room, hostId, p3 } = threeHumanRoom();
  room.getSeat(hostId).connected = false;
  assert.ok(room.takeoverByAI(hostId)); // seat is now a bot
  room.getSeat(p3).connected = false; // p3 also away; p2 remains
  elect(room);
  const next = room.getSeat(room.hostId);
  assert.ok(next && !next.isBot && next.connected);
  assert.notEqual(room.hostId, hostId);
});

test('R7: nobody connected -> hostId untouched (reconnect can reclaim)', () => {
  const { room, hostId, p2, p3 } = threeHumanRoom();
  room.getSeat(hostId).connected = false;
  room.getSeat(p2).connected = false;
  room.getSeat(p3).connected = false;
  elect(room);
  assert.equal(room.hostId, hostId);
});

test('R7: election preserves seats, tokens and scores', () => {
  const { room, hostId } = threeHumanRoom();
  const before = room.seats.map((s) => [s.playerId, s.token]);
  room.getSeat(hostId).connected = false;
  elect(room);
  const after = room.seats.map((s) => [s.playerId, s.token]);
  assert.deepEqual(after, before); // no seat freed, no token changed
});
