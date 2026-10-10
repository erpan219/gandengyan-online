import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomManager } from './rooms_manager.js';
import { attachMatch, Match } from './match.js';
import type { ClientMsg, ServerMsg } from './protocol.js';
import type { Seat } from './rooms.js';
import type { Room } from './rooms.js';

const PORT = Number(process.env.PORT) || 3000;

const candidateRoots = ['../../../client/dist', '../../client/dist', '../client/dist'];
const staticRoot = normalize(candidateRoots.find((candidate) => existsSync(candidate)) ?? candidateRoots[0]);
const rootPrefix = staticRoot.endsWith(sep) ? staticRoot : `${staticRoot}${sep}`;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function isUnderRoot(filePath: string): boolean {
  return filePath === staticRoot || filePath.startsWith(rootPrefix);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]).toString('utf8');
  return '';
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const host = req.headers.host ?? 'localhost';
    const url = new URL(req.url ?? '/', `http://${host}`);
    const pathname = safeDecode(url.pathname);
    const requested = pathname === '/' ? '/index.html' : normalize(pathname);
    const ext = extname(requested);
    const target = normalize(join(staticRoot, requested));

    if (!isUnderRoot(target)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let file = target;
    let contentType = MIME[ext] ?? 'application/octet-stream';
    let body: Buffer;

    try {
      body = await readFile(file);
    } catch {
      if (ext) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      file = normalize(join(staticRoot, 'index.html'));
      contentType = MIME['.html'];

      try {
        body = await readFile(file);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
    });
    res.end(body);
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end();
  }
}

const server = createServer(handleHttp);
const manager = new RoomManager();
// Global: pending AI takeover timers (playerId -> timeout)
// Allows cancelling takeover when player reconnects within grace period
const takeoverTimers = new Map<string, NodeJS.Timeout>();
// RESULTS-phase reconnect grace: preserves seat/token/scores after transport
// loss so a brief disconnect doesn't strand cumulative points. Distinct from
// intentional departure (LEAVE_ROOM), which frees the seat immediately.
const resultsGraceTimers = new Map<string, NodeJS.Timeout>();
const RESULTS_GRACE_MS = 120_000;

const wss = new WebSocketServer({ server, path: '/ws' });

const sweepTimer = setInterval(() => {
  (manager as any).sweep?.();
}, 10 * 60 * 1000);

function protocolMessage(type: string, payload: Record<string, unknown> = {}): ServerMsg {
  return { type, ...payload } as unknown as ServerMsg;
}

function send(ws: WebSocket, msg: ServerMsg): void {
  if ((ws as unknown as { readyState?: number }).readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

function roomStateMsg(room: Room): ServerMsg {
  room.revision += 1;
  return {
    type: 'ROOM_STATE',
    revision: room.revision,
    roomCode: room.code,
    playerCount: room.playerCount,
    seats: room.seatInfo(),
    phase: room.phase,
    hostId: room.hostId,
  };
}

function broadcastRoom(room: Room | null | undefined): void {
  if (!room) return;
  room.touch();
  room.broadcast(roomStateMsg(room));
}

function attachSeat(ws: WebSocket, seat: Seat): void {
  seat.ws = ws;
  seat.connected = true;
  seat.lastSeen = Date.now();
}

function detachSeat(seat: Seat | null): void {
  if (!seat) return;
  seat.connected = false;
  seat.ws = null;
  seat.lastSeen = Date.now();
}

/** Cancel any pending grace/takeover timers for a player. */
function cancelPlayerTimers(pid: string): void {
  const t1 = takeoverTimers.get(pid);
  if (t1) { clearTimeout(t1); takeoverTimers.delete(pid); }
  const t2 = resultsGraceTimers.get(pid);
  if (t2) { clearTimeout(t2); resultsGraceTimers.delete(pid); }
}

/** Free a seat immediately: replace with an empty slot and transfer host.
    Used for lobby disconnects, intentional departures, and expired RESULTS grace. */
function freeSeat(room: Room, seat: Seat): void {
  cancelPlayerTimers(seat.playerId);
  const seatId = seat.playerId;
  const wasHost = room.hostId === seatId;
  const idx = room.seats.findIndex((s) => s.playerId === seatId);
  if (idx >= 0) {
    room.seats[idx] = {
      playerId: `empty:${idx}`,
      name: '',
      isBot: false,
token: '',
      ready: false,
      ws: null,
      connected: false,
      lastSeen: Date.now(),
    };
  }
  if (wasHost) {
    const nextHost = room.seats.find(
      (s) => !s.playerId.startsWith('empty:') && !s.isBot && s.connected
    );
    room.hostId = nextHost ? nextHost.playerId : '';
  }
}

/** Schedule AI takeover for a disconnected human during PLAYING (30s grace). */
function scheduleTakeover(room: Room, seat: Seat): void {
  const pid = seat.playerId;
  const existing = takeoverTimers.get(pid);
  if (existing) clearTimeout(existing);
  const roomCode = room.code;
  const timer = setTimeout(() => {
    takeoverTimers.delete(pid);
    const r = manager.getRoom(roomCode);
    // Only take over if still disconnected and game still playing
    const s = r?.getSeat(pid);
    if (r && r.phase === 'PLAYING' && s && !s.isBot && !s.connected) {
      r.takeoverByAI(pid);
      currentMatch(r)?.onTimeout(pid);
      broadcastRoom(r);
    }
  }, 30000);
  takeoverTimers.set(pid, timer);
}

function currentMatch(room: Room | undefined): Match | null {
  return (room?.game as Match | null) ?? null;
}

// Rate limiting: track room creations per IP
const roomCreationTimes = new Map<string, number[]>();

function checkRoomCreationRate(ip: string): boolean {
  const now = Date.now();
  const times = roomCreationTimes.get(ip) ?? [];
  const recent = times.filter((t) => now - t < 60000); // 1 minute window
  if (recent.length >= 5) return false; // max 5 rooms per minute
  recent.push(now);
  roomCreationTimes.set(ip, recent);
  return true;
}

// Allowed origins for WebSocket connections (CSRF protection)
const ALLOWED_ORIGINS = new Set([
  'https://gandengyan.onrender.com',
  'http://localhost:3000',
  'http://localhost:5173',
]);

wss.on('connection', (ws: WebSocket, req) => {
  // Fix: Validate Origin header to prevent cross-site WebSocket hijacking
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
  (ws as unknown as { isAlive: boolean }).isAlive = true;

  ws.on('pong', () => {
    (ws as unknown as { isAlive: boolean }).isAlive = true;
  });

  let seat: Seat | null = null;
  let roomCode: string | null = null;

  const currentRoom = (): Room | undefined =>
    roomCode ? manager.getRoom(roomCode) : undefined;

  const welcome = (s: Seat): void => {
    send(ws, { type: 'WELCOME', playerId: s.playerId, token: s.token });
  };

  ws.on('message', (raw) => {
    const text = toText(raw);
    if (!text) return;
    // Limit message size to prevent memory exhaustion
    if (text.length > 10000) return;

    let msg: ClientMsg;
    try {
      msg = JSON.parse(text) as ClientMsg;
    } catch {
      return;
    }

    // Validate message structure
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'HELLO': {
        if (msg.token !== undefined && typeof msg.token !== 'string') break;
        if (!msg.token) break;
        const found = manager.findByToken(msg.token);
        if (!found) {
          // Actionable response: the session is gone (expired grace or freed
          // seat). Tell the client to rejoin manually instead of hanging.
          send(ws, { type: 'ERROR', code: 'SESSION_EXPIRED',
            message: 'Session expired. Please rejoin the room.' });
          break;
        }
        seat = found.seat;
        roomCode = found.room.code;
        // Cancel pending AI takeover / RESULTS grace (player reconnected)
        cancelPlayerTimers(seat.playerId);
        // Reclaim seat if AI took over during disconnect
        if (seat.isBot) {
          found.room.reclaimFromAI(seat.playerId);
        }
        attachSeat(ws, seat);
        // R1: if no valid connected human host exists, the reconnecting human
        // becomes host. Never steal host from a valid transferred host.
        if (!seat.isBot) {
          const curHost = found.room.seats.find(
            (s) => s.playerId === found.room.hostId && !s.isBot && s.connected
          );
          if (!curHost) {
            found.room.hostId = seat.playerId;
          }
        }
        welcome(seat);
        broadcastRoom(found.room);
        if (found.room.phase === 'PLAYING' || found.room.phase === 'RESULTS') {
          currentMatch(found.room)?.onReconnect(seat.playerId);
        }
        break;
      }

      case 'CREATE_ROOM': {
        if (typeof msg.name !== 'string') break;
        if (msg.playerCount !== 3 && msg.playerCount !== 4) break;
        if (typeof msg.fillWithBots !== 'boolean') break;
        // Rate limit room creation
        const clientIp = (req.socket.remoteAddress ?? 'unknown');
        if (!checkRoomCreationRate(clientIp)) {
          send(ws, { type: 'ERROR', code: 'RATE_LIMITED', message: 'Too many rooms. Wait a minute.' });
          break;
        }
        const name = msg.name.trim().slice(0, 20) || 'Player';
        const pc = msg.playerCount === 4 ? 4 : 3;
        const { room, hostSeat } = manager.createRoom(pc, msg.fillWithBots, name, msg.noShuffle ?? false);
        seat = hostSeat;
        roomCode = room.code;
        attachSeat(ws, seat);
        welcome(seat);
        broadcastRoom(room);
        break;
      }

      case 'JOIN_ROOM': {
        if (typeof msg.roomCode !== 'string' || typeof msg.name !== 'string') break;
        const room = manager.getRoom(msg.roomCode);
        if (!room) {
          send(ws, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
          break;
        }
        // Idempotent: if this socket already has a seat in this room (e.g. via HELLO),
        // don't create a duplicate — just re-welcome the existing seat
        if (seat && roomCode === room.code && room.getSeat(seat.playerId)) {
          welcome(seat);
          broadcastRoom(room);
          if (room.phase === 'PLAYING' || room.phase === 'RESULTS') {
            currentMatch(room)?.onReconnect(seat.playerId);
          }
          break;
        }
        try {
          const joined = room.addHuman(msg.name.trim().slice(0, 20) || 'Player', msg.token);
          seat = joined;
          roomCode = room.code;
          attachSeat(ws, joined);
          welcome(joined);
          broadcastRoom(room);
          if (room.phase === 'PLAYING' || room.phase === 'RESULTS') {
            currentMatch(room)?.onReconnect(joined.playerId);
          }
        } catch (error) {
          const code = error instanceof Error && error.message === 'ROOM_FULL' ? 'ROOM_FULL' : 'SERVER_ERROR';
          // Don't leak internal error details to client
          const message = code === 'ROOM_FULL' ? 'Room is full.' : 'Join failed.';
          send(ws, { type: 'ERROR', code, message });
        }
        break;
      }

      case 'SET_READY': {
        if (!seat) break;
        // Reject commands from replaced sockets
        if (seat.ws !== ws) break;
        if (typeof msg.ready !== 'boolean') break;
        seat.ready = msg.ready;
        seat.lastSeen = Date.now();
        broadcastRoom(currentRoom());
        break;
      }

      case 'START_GAME': {
        // Reject commands from replaced sockets
        if (seat && seat.ws !== ws) break;
        if (!seat) {
          send(ws, { type: 'ERROR', code: 'NO_SEAT', message: 'You are not seated. Try rejoining the room.' });
          break;
        }
        const room = currentRoom();
        if (!room) {
          send(ws, { type: 'ERROR', code: 'NO_ROOM', message: 'Room not found. Try rejoining.' });
          break;
        }
        if (room.hostId !== seat.playerId) {
          send(ws, { type: 'ERROR', code: 'NOT_HOST', message: 'Only the host can start.' });
          break;
        }
        const match = currentMatch(room);
        if (room.phase === 'RESULTS' && match) {
          // Validate occupancy before starting next hand (same as first hand)
          if (room.fillWithBots) room.fillEmptySeats();
          const activeSeats = room.seats.filter(s => !s.playerId.startsWith('empty:'));
          if (activeSeats.length < room.playerCount) {
            send(ws, { type: 'ERROR', code: 'SEATS_EMPTY',
              message: `Not enough players (${activeSeats.length}/${room.playerCount}). Waiting for more players.` });
            break;
          }
          match.nextHand();
          // Players who disconnected during RESULTS keep their seats; give
          // them the same AI-takeover grace as a mid-game disconnect so the
          // new hand can proceed whether or not they return in time.
          for (const s of room.seats) {
            if (!s.isBot && !s.playerId.startsWith('empty:') && !s.connected) {
              scheduleTakeover(room, s);
            }
          }
          break;
        }
        if (room.phase === 'PLAYING') {
          // Client may have missed GAME_STATE - resend it
          if (match && seat) {
            match.onReconnect(seat.playerId);
          }
          break;
        }
        if (room.fillWithBots) room.fillEmptySeats();
        if (room.seats.some((s) => s.playerId.startsWith('empty:'))) {
          send(ws, { type: 'ERROR', code: 'SEATS_EMPTY', message: 'All seats must be filled.' });
          break;
        }
        if (!room.allHumansReady()) {
          send(ws, { type: 'ERROR', code: 'NOT_READY', message: 'All players must be ready.' });
          break;
        }
        const humans = room.seats.filter((s) => !s.playerId.startsWith('empty:') && !s.isBot);
        if (humans.length === 0) {
          send(ws, { type: 'ERROR', code: 'NO_PLAYERS', message: 'No players in room.' });
          break;
        }
        attachMatch(room).start();
        break;
      }

      case 'PLAY_CARDS': {
        if (!seat) break;
        if (seat.ws !== ws) break;
        if (!Array.isArray(msg.cardIds) || !msg.cardIds.every((c) => typeof c === 'string')) break;
        if (typeof msg.expectedRevision !== 'number') break;
        currentMatch(currentRoom())?.onAction(seat.playerId, 'PLAY', msg.cardIds, msg.expectedRevision);
        break;
      }

      case 'PASS': {
        if (!seat) break;
        if (seat.ws !== ws) break;
        if (typeof msg.expectedRevision !== 'number') break;
        currentMatch(currentRoom())?.onAction(seat.playerId, 'PASS', [], msg.expectedRevision);
        break;
      }

      case 'CHAT': {
        if (!seat) break;
        if (typeof msg.text !== 'string') break;
        const room = currentRoom();
        if (!room) break;
        // Rate limit: 1 message per 3 seconds
        const now = Date.now();
        const lastChat = (seat as unknown as { lastChat?: number }).lastChat ?? 0;
        if (now - lastChat < 3000) break;
        (seat as unknown as { lastChat?: number }).lastChat = now;
        const text = msg.text.slice(0, 50);
        if (!text.trim()) break;
        room.broadcast({ type: 'CHAT_MSG', from: seat.playerId, fromName: seat.name, text });
        break;
      }

      case 'PING': {
        send(ws, { type: 'PONG' });
        break;
      }

      case 'LEAVE_ROOM': {
        // Intentional departure (vs. transport loss): free the seat
        // immediately in LOBBY/RESULTS. During PLAYING the seat must stay
        // for the AI-takeover grace, so leave it to the close handler.
        // R2: ignore from superseded sockets — only the current owner can leave.
        if (seat && seat.ws !== ws) break;
        const room = currentRoom();
        if (room && seat && !seat.isBot &&
            (room.phase === 'LOBBY' || room.phase === 'RESULTS')) {
          freeSeat(room, seat);
          broadcastRoom(room);
          seat = null;
          roomCode = null;
          try { ws.close(); } catch { /* ignore */ }
        }
        break;
      }

      default: {
        send(ws, { type: 'ERROR', code: 'UNKNOWN_MESSAGE', message: 'Unknown message.' });
        break;
      }
    }
  });

  ws.on('close', () => {
    // Socket ownership check: if seat was reclaimed by a new connection,
    // this old socket's close event must not detach it
    if (seat && seat.ws && seat.ws !== ws) {
      return; // stale close event, ignore
    }
    const room = currentRoom();
    if (room && room.phase === 'PLAYING' && seat && !seat.isBot) {
      // Grace period: wait 30s before AI takeover to allow reconnect.
      // Mark as disconnected but don't free the seat (game in progress).
      scheduleTakeover(room, seat);
      detachSeat(seat);
    } else if (room && room.phase === 'RESULTS' && seat && !seat.isBot) {
      // RESULTS disconnect (transport loss): preserve seat/token/scores so a
      // brief disconnect doesn't strand the player's identity and cumulative
      // points. No AI takeover here — no game is in progress. Host transfers
      // immediately so the room stays operable; the seat is freed if the
      // player doesn't return within the grace period.
      detachSeat(seat);
      if (room.hostId === seat.playerId) {
        const nextHost = room.seats.find(
          (s) => !s.playerId.startsWith('empty:') && !s.isBot && s.connected
        );
        room.hostId = nextHost ? nextHost.playerId : '';
      }
      const pid = seat.playerId;
      const rc = room.code;
      const existing = resultsGraceTimers.get(pid);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        resultsGraceTimers.delete(pid);
        const r = manager.getRoom(rc);
        if (r && r.phase === 'RESULTS') {
          const s = r.getSeat(pid);
          if (s && !s.isBot && !s.connected) {
            freeSeat(r, s);
            broadcastRoom(r);
          }
        }
      }, RESULTS_GRACE_MS);
      resultsGraceTimers.set(pid, timer);
    } else if (room && seat) {
      // Lobby disconnect: free the seat so others can join
      // and transfer host if the host left
      freeSeat(room, seat);
    } else {
      detachSeat(seat);
    }
    broadcastRoom(currentRoom());
  });

  ws.on('error', () => {
    // Cleanup handled by close listener.
  });
});

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    const state = ws as any;
    if (!state.isAlive) {
      ws.terminate();
      continue;
    }
    state.isAlive = false;
    ws.ping();
  }
}, 25000);

function stop(): void {
  clearInterval(sweepTimer);
  clearInterval(heartbeatTimer);
  wss.close();
  server.close();
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
