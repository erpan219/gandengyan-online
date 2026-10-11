import { expect, type Page } from '@playwright/test';

interface ProtocolFrame { type: string; [key: string]: unknown }

export interface Seat {
  playerId: string;
  name: string;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
}
export interface PlayerView {
  gameId: string;
  revision: number;
  selfId: string;
  selfHand: string[];
  players: { id: string; cardCount: number; place: number | null }[];
  currentPlayerId: string | null;
  lastPlay: null | { playerId: string; combination: { kind: string; cardIds: string[]; cardCount: number; strength: number } };
  passedSinceLastPlay: string[];
  finishOrder: string[];
  status: string;
}
export interface GameFrame extends ProtocolFrame {
  type: 'GAME_STATE';
  revision: number;
  view: PlayerView;
  handNumber: number;
  botIds: string[];
  scores: Record<string, number>;
  handScores: Record<string, number>;
}
export interface RoomFrame extends ProtocolFrame {
  type: 'ROOM_STATE';
  revision: number;
  roomCode: string;
  playerCount: number;
  seats: Seat[];
  phase: string;
  hostId: string;
}
export interface WelcomeFrame extends ProtocolFrame { type: 'WELCOME'; playerId: string; token: string }
export type Frame = GameFrame | RoomFrame | WelcomeFrame | { type: string; [key: string]: unknown };

/** Read-only observer of actual server frames, attached BEFORE creating a socket.
 * It never injects server messages or accesses the application's game state.
 */
export class FrameJournal {
  readonly received: Frame[] = [];
  readonly sent: Record<string, unknown>[] = [];
  readonly pageErrors: string[] = [];
  connections = 0;
  closedConnections = 0;

  constructor(page: Page) {
    page.on('pageerror', error => this.pageErrors.push(error.message));
    page.on('websocket', socket => {
      const url = new URL(socket.url());
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error(`Non-local WebSocket forbidden: ${url.origin}`);
      this.connections++;
      socket.on('close', () => this.closedConnections++);
      socket.on('framereceived', frame => this.record(frame.payload, this.received));
      socket.on('framesent', frame => this.record(frame.payload, this.sent));
    });
  }

  private record(payload: string | Buffer, target: unknown[]): void {
    try { target.push(JSON.parse(String(payload))); } catch { /* Non-JSON frames are not protocol messages. */ }
  }

  latest<T extends Frame>(type: T['type']): T | undefined {
    return [...this.received].reverse().find(message => message.type === type) as T | undefined;
  }

  get game(): GameFrame {
    const frame = this.latest<GameFrame>('GAME_STATE');
    if (!frame) throw new Error('No GAME_STATE has arrived');
    return frame;
  }
  get room(): RoomFrame {
    const frame = this.latest<RoomFrame>('ROOM_STATE');
    if (!frame) throw new Error('No ROOM_STATE has arrived');
    return frame;
  }
  get playerId(): string {
    const frame = this.latest<WelcomeFrame>('WELCOME');
    if (!frame) throw new Error('No WELCOME has arrived');
    return frame.playerId;
  }

  async waitFor<T extends Frame>(type: T['type'], predicate: (frame: T) => boolean = () => true, options: { after?: number; timeout?: number } = {}): Promise<T> {
    let match: T | undefined;
    await expect.poll(() => {
      match = this.received.slice(options.after ?? 0).find(frame => frame.type === type && predicate(frame as T)) as T | undefined;
      return !!match;
    }, { timeout: options.timeout ?? 10_000, message: `Waiting for real ${type} frame matching predicate`, intervals: [25, 50, 100, 250] }).toBe(true);
    return match!;
  }

  diagnostic(): string {
    return JSON.stringify({
      connections: this.connections, closedConnections: this.closedConnections, pageErrors: this.pageErrors,
      received: this.received, sent: this.sent,
    }, (key, value) => key === 'token' ? '<redacted>' : value, 2);
  }
}
