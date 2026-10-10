import type { ServerMsg, SeatInfo, RoomPhase } from './protocol.js';
import type { WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';

export interface Seat {
  playerId: string;
  name: string;
  isBot: boolean;
  token: string;
  ready: boolean;
  ws: WebSocket | null;
  connected: boolean;
  lastSeen: number;
}

export class Room {
  code: string;
  revision: number = 0; // Monotonic counter for message ordering
  playerCount: 3 | 4;
  fillWithBots: boolean;
  noShuffle: boolean;
  hostId: string;
  seats: Seat[];
  phase: RoomPhase;
  lastActivity = Date.now();
  game: unknown = null;

  constructor(code: string, playerCount: 3 | 4, fillWithBots: boolean, noShuffle = false) {
    this.code = code;
    this.playerCount = playerCount;
    this.fillWithBots = fillWithBots;
    this.noShuffle = noShuffle;
    this.hostId = '';
    this.seats = Array.from({ length: playerCount }, (_, i): Seat => ({
      playerId: `empty:${i}`,
      name: '',
      isBot: false,
      token: '',
      ready: false,
      ws: null,
      connected: false,
      lastSeen: Date.now(),
    }));
    this.phase = 'LOBBY';
  }

  makeToken(): string {
    return randomBytes(16).toString("hex") // 128-bit tokens;
  }

  private emptyIndex(): number {
    return this.seats.findIndex((s) => s.playerId.startsWith('empty:'));
  }

  fillEmptySeats(): void {
    let i = this.emptyIndex();
    while (i >= 0) {
      this.addBot(`Bot ${i + 1}`);
      i = this.emptyIndex();
    }
  }

  addHuman(name: string, token?: string): Seat {
    if (token) {
      const existing = this.seats.find((s) => s.token === token);
      if (existing) {
        existing.name = name;
        existing.connected = true;
        existing.lastSeen = Date.now();
        if (!this.hostId || this.hostId.startsWith('empty:')) this.hostId = existing.playerId;
        this.touch();
        return existing;
      }
    }

    const i = this.emptyIndex();
    if (i < 0) throw new Error('ROOM_FULL');

    const seat: Seat = {
      playerId: 'p' + randomBytes(4).toString('hex'),
      name,
      isBot: false,
      token: token || this.makeToken(),
      ready: true, // Auto-ready on join
      ws: null,
      connected: true,
      lastSeen: Date.now(),
    };

    this.seats[i] = seat;
    if (!this.hostId || this.hostId.startsWith('empty:')) this.hostId = seat.playerId;
    this.touch();
    return seat;
  }

  addBot(name: string): Seat {
    const i = this.emptyIndex();
    if (i < 0) throw new Error('ROOM_FULL');

    const seat: Seat = {
      playerId: 'b' + randomBytes(4).toString('hex'),
      name,
      isBot: true,
      token: '',
      ready: true,
      ws: null,
      connected: true,
      lastSeen: Date.now(),
    };

    this.seats[i] = seat;
    this.touch();
    return seat;
  }

  getSeat(playerId: string): Seat | undefined {
    return this.seats.find((s) => s.playerId === playerId);
  }

  /** Convert a disconnected human seat to a bot so AI takes over instantly. */
  takeoverByAI(playerId: string): boolean {
    const seat = this.getSeat(playerId);
    if (!seat || seat.isBot || seat.playerId.startsWith('empty:')) return false;
    seat.isBot = true;
    seat.connected = true;
    seat.name = seat.name + ' (AI)';
    this.touch();
    return true;
  }

  /** Reclaim a bot seat back to human on reconnect with valid token. */
  reclaimFromAI(playerId: string): boolean {
    const seat = this.getSeat(playerId);
    if (!seat || !seat.isBot) return false;
    seat.isBot = false;
    seat.name = seat.name.replace(/ \(AI\)$/, '');
    this.touch();
    return true;
  }

  seatInfo(): SeatInfo[] {
    return this.seats.map((s) => ({
      playerId: s.playerId,
      name: s.name,
      isBot: s.isBot,
      ready: s.ready,
      connected: s.connected,
    }));
  }

  sendTo(playerId: string, msg: ServerMsg): void {
    const ws = this.getSeat(playerId)?.ws;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  broadcast(msg: ServerMsg, except?: string): void {
    for (const s of this.seats) {
      if (s.playerId !== except) this.sendTo(s.playerId, msg);
    }
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  allHumansReady(): boolean {
    return this.seats.every((s) => s.isBot || s.ready || s.playerId.startsWith('empty:'));
  }

  humanCount(): number {
    return this.seats.filter((s) => !s.isBot && !s.playerId.startsWith('empty:')).length;
  }
}
