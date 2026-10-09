import { Room, Seat } from './rooms.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class RoomManager {
  private rooms = new Map<string, Room>();

  private makeCode(): string {
    let code = '';
    do {
      code = Array.from(
        { length: 4 },
        () => CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
      ).join('');
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
