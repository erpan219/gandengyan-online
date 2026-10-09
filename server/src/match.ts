import { newHand, applyAction, getPlayerView } from "../../shared/engine.js";
import { createDeck, shuffle } from "../../shared/deck.js";
import { chooseBotMove } from "../../shared/bot.js";
import type { GameState, PlayerView, CardId } from "../../shared/types.js";
import { Room, Seat } from "./rooms.js";
import type { ServerMsg } from "./protocol.js";

export class Match {
  public room: Room;
  public state: GameState | null = null;
  public handNumber = 0;
  public previousWinnerId: string | null = null;
  public turnTimer: NodeJS.Timeout | null = null;
  public botTimer: NodeJS.Timeout | null = null;

  constructor(room: Room) {
    this.room = room;
  }

  private sendTo(playerId: string, msg: ServerMsg): void {
    this.room.sendTo(playerId, msg);
  }

  private broadcast(msg: ServerMsg): void {
    this.room.broadcast(msg);
  }

  private seatIds(): string[] {
    return this.room.seats
      .filter((seat: Seat) => seat.playerId && !seat.playerId.startsWith('empty:'))
      .map((seat: Seat) => seat.playerId);
  }

  private dealNewHand(handNumber: number, leaderId: string | null): void {
    const seatIds = this.seatIds();
    if (seatIds.length === 0) return;

    const shuffled: CardId[] = shuffle(createDeck().map((card) => card.id));
    const n = seatIds.length;
    let leader = leaderId && seatIds.includes(leaderId) ? leaderId : seatIds[0];
    let startSeatIndex = seatIds.indexOf(leader);
    if (!leaderId) {
      // First hand: holder of S-4 leads
      for (let i = 0; i < shuffled.length; i++) {
        if (shuffled[i] === 'S-4') {
          startSeatIndex = i % n;
          leader = seatIds[startSeatIndex];
          break;
        }
      }
    }

    this.state = newHand(seatIds, this.room.playerCount, handNumber, leader, shuffled, startSeatIndex);
    this.handNumber = handNumber;
    this.room.phase = 'PLAYING';
    this.broadcastViews();
    this.broadcastRoom();
    this.scheduleTurn();
  }

  start(): void {
    this.clearTurnTimer();
    this.clearBotTimer();
    this.previousWinnerId = null;
    this.dealNewHand(1, null);
  }

  nextHand(): void {
    this.clearTurnTimer();
    this.clearBotTimer();
    this.dealNewHand(this.handNumber + 1, this.previousWinnerId);
  }

  onReconnect(playerId: string): void {
    const state = this.state;
    if (!state) return;
    this.sendTo(playerId, {
      type: 'GAME_STATE',
      view: getPlayerView(state, playerId),
      handNumber: this.handNumber,
      previousWinnerId: this.previousWinnerId,
    });
    this.broadcastRoom();
  }

  broadcastViews(): void {
    const state = this.state;
    if (!state) return;

    for (const seat of this.room.seats) {
      const playerId = seat.playerId as string;
      if (!playerId || seat.isBot) continue;

      this.sendTo(playerId, {
        type: "GAME_STATE",
        view: getPlayerView(state, playerId),
        handNumber: this.handNumber,
        previousWinnerId: this.previousWinnerId,
      });
    }
  }

  onAction(
    playerId: string,
    kind: "PLAY" | "PASS",
    cardIds: CardId[],
    expectedRevision: number
  ): void {
    const state = this.state;
    if (!state || state.status !== "PLAYING") return;

    if (state.currentPlayerId !== playerId) {
      this.sendTo(playerId, {
        type: 'ERROR',
        code: 'NOT_YOUR_TURN',
        message: 'Not your turn.',
      });
      return;
    }

    this.applyMove(playerId, kind, cardIds, expectedRevision, "HUMAN");
  }

  broadcastRoom(): void {
    this.broadcast({
      type: "ROOM_STATE",
      roomCode: this.room.code,
      playerCount: this.room.playerCount,
      seats: this.room.seatInfo(),
      phase: this.room.phase,
      hostId: this.room.hostId,
    });
  }

  scheduleTurn(): void {
    this.clearTurnTimer();
    this.clearBotTimer();

    const state = this.state;
    if (!state || state.status !== "PLAYING") return;

    const cur = state.currentPlayerId;
    if (!cur) return;

    const seat = this.room.getSeat(cur);
    const delay = seat?.isBot ? 700 : 30000;

    this.turnTimer = setTimeout(() => this.onTimeout(cur), delay);
    if (seat?.isBot) {
      this.botTimer = this.turnTimer;
    }
  }

  onTimeout(playerId: string): void {
    const state = this.state;
    if (
      !state ||
      state.status !== "PLAYING" ||
      state.currentPlayerId !== playerId
    ) {
      return;
    }

    this.clearTurnTimer();
    this.clearBotTimer();

    const seat = this.room.getSeat(playerId);

    if (seat?.isBot) {
      const view: PlayerView = getPlayerView(state, playerId);
      const move = chooseBotMove(view, this.room.playerCount);
      const cardIds: CardId[] =
        move.type === "PLAY" ? (move.cardIds as CardId[]) : [];

      const ok = this.applyMove(
        playerId,
        move.type,
        cardIds,
        this.currentRevision(),
        "BOT"
      );

      if (!ok) this.scheduleTurn();
      return;
    }

    const ok = this.applyMove(
      playerId,
      "PASS",
      [],
      this.currentRevision(),
      "HUMAN"
    );

    if (!ok) this.scheduleTurn();
  }

  private applyMove(
    playerId: string,
    kind: "PLAY" | "PASS",
    cardIds: CardId[],
    expectedRevision: number,
    source: string
  ): boolean {
    const state = this.state;
    if (!state || state.status !== "PLAYING") return false;

    const actionId = `a${Date.now()}${playerId}`;
    const gameId = state.gameId;
    const action =
      kind === 'PLAY'
        ? { type: 'PLAY' as const, actionId, gameId, expectedRevision, cardIds }
        : { type: 'PASS' as const, actionId, gameId, expectedRevision };

    const res = applyAction(
      state,
      action,
      { playerId, source: source as 'HUMAN' | 'BOT' },
    );

    if (!res.ok) {
      if (source === 'HUMAN') {
        this.sendTo(playerId, {
          type: 'ERROR',
          code: res.code,
          message: res.code,
        });
      }
      return false;
    }

    this.state = res.state as GameState;
    this.clearTurnTimer();
    this.clearBotTimer();

    if (this.state.status === "FINISHED") {
      this.previousWinnerId =
        this.state.finishOrder[0] ?? null;
      this.room.phase = "RESULTS";
    }

    this.broadcastViews();
    this.broadcastRoom();
    this.scheduleTurn();
    return true;
  }

  private currentRevision(): number {
    return this.state?.revision ?? 0;
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  private clearBotTimer(): void {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }
}

export function attachMatch(room: Room): Match {
  const match = new Match(room);
  room.game = match;
  return match;
}
