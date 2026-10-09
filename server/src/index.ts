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
  return {
    type: 'ROOM_STATE',
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
        if (!found) break;
        seat = found.seat;
        roomCode = found.room.code;
        // Reclaim seat if AI took over during disconnect
        if (seat.isBot) {
          found.room.reclaimFromAI(seat.playerId);
        }
        attachSeat(ws, seat);
        welcome(seat);
        broadcastRoom(found.room);
        if (found.room.phase === 'PLAYING') {
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
        try {
          const joined = room.addHuman(msg.name.trim().slice(0, 20) || 'Player', msg.token);
          seat = joined;
          roomCode = room.code;
          attachSeat(ws, joined);
          welcome(joined);
          broadcastRoom(room);
          if (room.phase === 'PLAYING') {
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
        if (typeof msg.ready !== 'boolean') break;
        seat.ready = msg.ready;
        seat.lastSeen = Date.now();
        broadcastRoom(currentRoom());
        break;
      }

      case 'START_GAME': {
        if (!seat) break;
        const room = currentRoom();
        if (!room) break;
        if (room.hostId !== seat.playerId) {
          send(ws, { type: 'ERROR', code: 'NOT_HOST', message: 'Only the host can start.' });
          break;
        }
        const match = currentMatch(room);
        if (room.phase === 'RESULTS' && match) {
          match.nextHand();
          break;
        }
        if (room.phase === 'PLAYING') break;
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
        if (!Array.isArray(msg.cardIds) || !msg.cardIds.every((c) => typeof c === 'string')) break;
        if (typeof msg.expectedRevision !== 'number') break;
        currentMatch(currentRoom())?.onAction(seat.playerId, 'PLAY', msg.cardIds, msg.expectedRevision);
        break;
      }

      case 'PASS': {
        if (!seat) break;
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

      default: {
        send(ws, { type: 'ERROR', code: 'UNKNOWN_MESSAGE', message: 'Unknown message.' });
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = currentRoom();
    // AI takes over instantly if a player disconnects mid-game
    if (room && room.phase === 'PLAYING' && seat && !seat.isBot) {
      room.takeoverByAI(seat.playerId);
      // If it was their turn, trigger the bot to move
      currentMatch(room)?.onTimeout(seat.playerId);
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
