import type { CardId, PlayerView } from '../../shared/types.js';

export type ClientMsg =
  | { type: 'HELLO'; token?: string }
  | { type: 'CREATE_ROOM'; name: string; playerCount: 3 | 4; fillWithBots: boolean }
  | { type: 'JOIN_ROOM'; roomCode: string; name: string; token?: string }
  | { type: 'SET_READY'; ready: boolean }
  | { type: 'START_GAME' }
  | { type: 'PLAY_CARDS'; cardIds: CardId[]; expectedRevision: number }
  | { type: 'PASS'; expectedRevision: number }
  | { type: 'PING' };

export interface SeatInfo {
  playerId: string;
  name: string;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
}

export type RoomPhase = 'LOBBY' | 'PLAYING' | 'RESULTS';

export type ServerMsg =
  | { type: 'WELCOME'; playerId: string; token: string }
  | { type: 'ROOM_STATE'; roomCode: string; playerCount: number; seats: SeatInfo[]; phase: RoomPhase; hostId: string }
  | { type: 'GAME_STATE'; view: PlayerView; handNumber: number; previousWinnerId: string | null }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG' };
