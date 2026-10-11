/**
 * Isolated protocol tests for the R3–R6 session fixes.
 *
 * These speak raw WebSocket to a disposable local server (spawned by the
 * server fixture) — no browser, no UI. Each test gets a fresh server.
 *
 * Covered:
 *  R3 — one active room binding per socket (cross-room join/create rejected,
 *       no seat hopping via HELLO/JOIN with another seat's token)
 *  R4 — server-issued reconnect tokens (malformed/unknown tokens rejected,
 *       client text never installed as a credential)
 *  R5 — superseded sockets cannot chat (or act) as the player
 *  R6 — PLAY/PASS carry hand identity (gameId); stale/foreign actions rejected
 */
import { serverTest as test, expect } from '../fixtures/server';
import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3000/ws';
const HEX32 = /^[0-9a-f]{32}$/i;

interface Frame { type: string; [k: string]: unknown }

class Client {
  readonly ws: WebSocket;
  readonly received: Frame[] = [];
  private opened: Promise<void>;

  constructor() {
    this.ws = new WebSocket(WS_URL);
    this.opened = new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
    this.ws.on('message', (data) => {
      try { this.received.push(JSON.parse(data.toString()) as Frame); }
      catch { /* ignore non-JSON */ }
    });
  }

  async open(): Promise<void> { await this.opened; }
  send(obj: Record<string, unknown>): void { this.ws.send(JSON.stringify(obj)); }
  clear(): void { this.received.length = 0; }
  close(): void { try { this.ws.close(); } catch { /* ignore */ } }

  async waitFor(pred: (m: Frame) => boolean, timeout = 5_000): Promise<Frame> {
    const start = Date.now();
    for (;;) {
      const found = this.received.find(pred);
      if (found) return found;
      if (Date.now() - start > timeout) {
        throw new Error(`Timed out waiting for frame; got: ${JSON.stringify(this.received.map((m) => m.type))}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async errorCode(timeout = 5_000): Promise<string> {
    const f = await this.waitFor((m) => m.type === 'ERROR', timeout);
    return String(f.code);
  }
}

async function createRoom(c: Client, name = 'Host'): Promise<{ code: string; token: string; playerId: string }> {
  await c.open();
  c.send({ type: 'CREATE_ROOM', name, playerCount: 3, fillWithBots: true });
  const welcome = await c.waitFor((m) => m.type === 'WELCOME');
  const state = await c.waitFor((m) => m.type === 'ROOM_STATE');
  return {
    code: String(state.roomCode),
    token: String(welcome.token),
    playerId: String(welcome.playerId),
  };
}

async function joinRoom(c: Client, code: string, name: string, token?: string): Promise<Frame> {
  await c.open();
  c.clear();
  c.send({ type: 'JOIN_ROOM', roomCode: code, name, ...(token ? { token } : {}) });
  return c.waitFor((m) => m.type === 'WELCOME' || m.type === 'ERROR');
}

// ---------- R3: one active room binding per socket ----------

test('R3: joining a second room on the same socket is rejected', async () => {
  const a = new Client();
  const { code: codeA } = await createRoom(a, 'HostA');
  const b = new Client();
  const { code: codeB } = await createRoom(b, 'HostB');
  expect(codeA).not.toBe(codeB);

  // Snapshot room A's state before the rejected join.
  const before = a.received
    .filter((m) => m.type === 'ROOM_STATE' && m.roomCode === codeA)
    .pop() as Frame & { seats: { playerId: string; connected: boolean }[] };

  // Socket a is bound to room A; joining room B must be rejected.
  a.clear();
  a.send({ type: 'JOIN_ROOM', roomCode: codeB, name: 'Sneaky' });
  expect(await a.errorCode()).toBe('ALREADY_IN_ROOM');

  // Nothing changed: no new room state was emitted, and the pre-rejection
  // snapshot still shows the single connected human seat.
  expect(a.received.some((m) => m.type === 'ROOM_STATE')).toBe(false);
  const humans = before.seats
    .filter((s) => !s.playerId.startsWith('empty:') && !s.playerId.startsWith('b'));
  expect(humans).toHaveLength(1);
  expect(humans[0].connected).toBe(true);
  a.close(); b.close();
});

test('R3: creating a room while bound is rejected before any room is made', async () => {
  const a = new Client();
  await createRoom(a, 'HostA');
  a.clear();
  a.send({ type: 'CREATE_ROOM', name: 'HostA2', playerCount: 3, fillWithBots: true });
  expect(await a.errorCode()).toBe('ALREADY_IN_ROOM');
  // No new WELCOME/ROOM_STATE for a second room arrived.
  expect(a.received.some((m) => m.type === 'WELCOME')).toBe(false);
  a.close();
});

test('R3: HELLO with another seat\u2019s token cannot hop seats on a bound socket', async () => {
  const a = new Client();
  const infoA = await createRoom(a, 'HostA');
  const b = new Client();
  await b.open();
  // b joins A's room as a second human (no token -> new seat).
  const joined = await joinRoom(b, infoA.code, 'GuestB');
  expect(joined.type).toBe('WELCOME');
  const tokenB = String(joined.token);

  // Socket a is bound to seat A; HELLO with seat B's token must be rejected.
  a.clear();
  a.send({ type: 'HELLO', token: tokenB });
  expect(await a.errorCode()).toBe('SESSION_EXPIRED');
  a.close(); b.close();
});

// ---------- R4: server-issued tokens ----------

test('R4: JOIN_ROOM with a malformed token is rejected', async () => {
  const a = new Client();
  const { code } = await createRoom(a, 'HostA');
  const c = new Client();
  await c.open();
  c.send({ type: 'JOIN_ROOM', roomCode: code, name: 'X', token: 'not-a-token' });
  expect(await c.errorCode()).toBe('SESSION_EXPIRED');
  a.close(); c.close();
});

test('R4: JOIN_ROOM with an unknown well-formed token is rejected, not silently seated', async () => {
  const a = new Client();
  const { code } = await createRoom(a, 'HostA');
  const c = new Client();
  await c.open();
  c.send({ type: 'JOIN_ROOM', roomCode: code, name: 'X', token: 'a'.repeat(32) });
  expect(await c.errorCode()).toBe('SESSION_EXPIRED');
  // No seat was created for the unknown token.
  expect(c.received.some((m) => m.type === 'WELCOME')).toBe(false);
  a.close(); c.close();
});

test('R4: fresh joins receive server-issued 32-hex tokens', async () => {
  const a = new Client();
  const { token } = await createRoom(a, 'HostA');
  expect(token).toMatch(HEX32);
  a.close();
});

test('R4: reconnect with a valid token reclaims the same seat', async () => {
  const a = new Client();
  const { code, token, playerId } = await createRoom(a, 'HostA');
  // PLAYING phase preserves the seat across transport loss (takeover grace).
  // (In LOBBY the seat is intentionally freed on disconnect.)
  a.send({ type: 'START_GAME' });
  await a.waitFor((m) => m.type === 'GAME_STATE', 15_000);
  a.close(); // transport loss during PLAYING
  const b = new Client();
  const welcome = await joinRoom(b, code, 'HostA', token);
  expect(welcome.type).toBe('WELCOME');
  expect(String(welcome.playerId)).toBe(playerId);
  expect(String(welcome.token)).toBe(token);
  b.close();
});

// ---------- R5: superseded sockets cannot act ----------

test('R5: a superseded socket cannot chat as the player', async () => {
  const a = new Client();
  const { token } = await createRoom(a, 'HostA');

  // b reconnects with a's token and becomes the current owner.
  const b = new Client();
  await b.open();
  b.send({ type: 'HELLO', token });
  await b.waitFor((m) => m.type === 'WELCOME');

  // Old socket a tries to chat — must be dropped silently.
  b.clear();
  a.send({ type: 'CHAT', text: 'from stale socket' });
  await new Promise((r) => setTimeout(r, 600));
  expect(b.received.some((m) => m.type === 'CHAT_MSG')).toBe(false);

  // Current owner can still chat.
  b.send({ type: 'CHAT', text: 'from owner' });
  const chat = await b.waitFor((m) => m.type === 'CHAT_MSG');
  expect(String(chat.text)).toBe('from owner');
  a.close(); b.close();
});

// ---------- R6: hand identity on actions ----------

async function startBotGame(c: Client): Promise<{ gameId: string; hand: string[] }> {
  await c.open();
  c.send({ type: 'CREATE_ROOM', name: 'Host', playerCount: 3, fillWithBots: true });
  await c.waitFor((m) => m.type === 'WELCOME');
  await c.waitFor((m) => m.type === 'ROOM_STATE');
  c.clear();
  c.send({ type: 'START_GAME' });
  const gs = await c.waitFor((m) => m.type === 'GAME_STATE', 15_000);
  const view = gs.view as { selfHand: string[] };
  return { gameId: String(gs.gameId), hand: [...view.selfHand] };
}

test('R6: PLAY_CARDS with a foreign gameId is rejected and changes nothing', async () => {
  const c = new Client();
  const { gameId, hand } = await startBotGame(c);
  expect(gameId).toBeTruthy();

  c.clear();
  c.send({ type: 'PLAY_CARDS', cardIds: [hand[0]], expectedRevision: 0, gameId: 'deadbeef'.repeat(8) });
  expect(await c.errorCode()).toBe('STALE_ACTION');

  // Re-request state; the hand must be untouched.
  c.send({ type: 'START_GAME' }); // PLAYING: resends GAME_STATE
  const gs = await c.waitFor((m) => m.type === 'GAME_STATE' && (m.view as { selfHand: string[] }).selfHand.length === hand.length, 15_000);
  expect((gs.view as { selfHand: string[] }).selfHand).toEqual(hand);
  c.close();
});

test('R6: PLAY_CARDS without gameId tells an outdated client to refresh', async () => {
  const c = new Client();
  await startBotGame(c);
  c.clear();
  c.send({ type: 'PLAY_CARDS', cardIds: [], expectedRevision: 0 });
  expect(await c.errorCode()).toBe('CLIENT_OUTDATED');
  c.close();
});

test('R6: PLAY_CARDS with the current gameId passes the identity gate', async () => {
  const c = new Client();
  const { gameId, hand } = await startBotGame(c);
  c.clear();
  // A single card is always a legal combination shape; the gate under test is
  // gameId, so any non-identity error (or acceptance) proves we got past it.
  c.send({ type: 'PLAY_CARDS', cardIds: [hand[0]], expectedRevision: 0, gameId });
  const err = await c.waitFor((m) => m.type === 'ERROR', 5_000).catch(() => null);
  expect(err === null || !['STALE_ACTION', 'CLIENT_OUTDATED'].includes(String(err.code))).toBe(true);
  c.close();
});
