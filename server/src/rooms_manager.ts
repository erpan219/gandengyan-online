import { Room, Seat } from './rooms.js';
import { randomBytes } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class RoomManager {
  private rooms = new Map<string, Room>();

  private makeCode(): string {
    // Fix: 6-char codes with crypto RNG (was 4 chars with Math.random)
    // 31^6 = 887M combinations vs 31^4 = 923K
    let code = '';
    do {
      const bytes = randomBytes(6);
      code = Array.from(bytes, (b) => CODE_CHARS.charAt(b % CODE_CHARS.length)).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(
    playerCount: 3 | 4,
    fillWithBots: boolean,
    hostName: string,
    noShuffle = false
  ): { room: Room; hostSeat: Seat } {
    const code = this.makeCode();
    const room = new Room(code, playerCount, fillWithBots, noShuffle);
    const hostSeat = room.addHuman(hostName);
    room.hostId = hostSeat.playerId;
    this.rooms.set(code, room);
    return { room, hostSeat };
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  findByToken(token: string): { room: Room; seat: Seat } | undefined {
    for (const room of this.rooms.values()) {
      const seat = room.seats.find((s) => s.token === token && token !== '');
      if (seat) return { room, seat };
    }
    return undefined;
  }

  sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity > 2 * 60 * 60 * 1000) {
        this.rooms.delete(code);
      }
    }
  }

  roomCount(): number {
    return this.rooms.size;
  }
}
