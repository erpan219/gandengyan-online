import { newHand, applyAction, getPlayerView } from "../../shared/engine.js";
import { createDeck, shuffle, barelyShuffle } from "../../shared/deck.js";
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
  /** Cumulative scores across hands: playerId -> total points */
  public scores: Record<string, number> = {};
  /** Bombs played this hand: playerId -> {bombs, rockets} */
  private handBombs: Record<string, { bombs: number; rockets: number }> = {};

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

    // Reset per-hand bomb tracking
    this.handBombs = {};
    for (const id of seatIds) {
      this.handBombs[id] = { bombs: 0, rockets: 0 };
    }

    const deckIds = createDeck().map((card) => card.id);
    const shuffled: CardId[] = this.room.noShuffle ? barelyShuffle(deckIds) : shuffle(deckIds);
    const n = seatIds.length;
    let leader = leaderId && seatIds.includes(leaderId) ? leaderId : seatIds[0];
    let startSeatIndex = seatIds.indexOf(leader);
    if (!leaderId) {
      // First hand: holder of S-4 leads. Deal from seat 0 so deck index i
      // lands on seatIds[i % n], keeping the S-4 holder calculation correct.
      startSeatIndex = 0;
      for (let i = 0; i < shuffled.length; i++) {
        if (shuffled[i] === 'S-4') {
          leader = seatIds[i % n];
          break;
        }
      }
    }

    this.state = newHand(seatIds, this.room.playerCount, handNumber, leader, shuffled, startSeatIndex);
    this.handNumber = handNumber;
    this.room.phase = 'PLAYING';
    // IMPORTANT: broadcast room first so clients update seatMap before GAME_STATE
    this.broadcastRoom();
    this.broadcastViews();
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

  /** Collect bot player IDs for GAME_STATE so client doesn't rely on stale room state. */
  private botIds(): string[] {
    return this.room.seats
      .filter(s => s.isBot && s.playerId && !s.playerId.startsWith('empty:'))
      .map(s => s.playerId as string);
  }

  onReconnect(playerId: string): void {
    const state = this.state;
    if (!state) return;
    this.room.revision += 1;
    this.sendTo(playerId, {
      type: 'GAME_STATE',
      revision: this.room.revision,
      view: getPlayerView(state, playerId),
      handNumber: this.handNumber,
      previousWinnerId: this.previousWinnerId,
      scores: this.scores,
      handScores: this.handScores,
      botIds: this.botIds(),
    });
    this.broadcastRoom();
  }

  broadcastViews(): void {
    const state = this.state;
    if (!state) return;

    for (const seat of this.room.seats) {
      const playerId = seat.playerId as string;
      if (!playerId || seat.isBot) continue;

      this.room.revision += 1;
      this.sendTo(playerId, {
        type: "GAME_STATE",
        revision: this.room.revision,
        view: getPlayerView(state, playerId),
        handNumber: this.handNumber,
        previousWinnerId: this.previousWinnerId,
        scores: this.scores,
        handScores: this.handScores,
        botIds: this.botIds(),
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
    this.room.revision += 1;
    this.broadcast({
      type: "ROOM_STATE",
      revision: this.room.revision,
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
      try {
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
      } catch (err) {
        // Bot logic crashed (e.g. edge case in endgame). Log and try to pass
        // as a safe fallback instead of freezing the game.
        console.error(`[BOT] Move failed for ${playerId}:`, err);
        try {
          const ok = this.applyMove(
            playerId,
            "PASS",
            [],
            this.currentRevision(),
            "BOT"
          );
          if (!ok) this.scheduleTurn();
        } catch (passErr) {
          console.error(`[BOT] Pass fallback also failed:`, passErr);
          // Don't retry infinitely - leave turn scheduled via existing timer
          // The 30s human timeout will eventually trigger as last resort
        }
      }
      return;
    }

    // Human timeout: pass if responding, otherwise auto-play a valid lead
    // (passing is illegal on a free lead).
    const isFreeLead = state.lastPlay === null;
    if (isFreeLead) {
      const view: PlayerView = getPlayerView(state, playerId);
      const move = chooseBotMove(view, this.room.playerCount);
      const cardIds: CardId[] =
        move.type === "PLAY" ? (move.cardIds as CardId[]) : [];
      const ok = this.applyMove(
        playerId,
        move.type,
        cardIds,
        this.currentRevision(),
        "HUMAN"
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

    // Track bombs for scoring
    if (kind === 'PLAY' && this.state.lastPlay) {
      const comboKind = this.state.lastPlay.combination.kind;
      if (comboKind === 'ROCKET') {
        this.handBombs[playerId].rockets++;
      } else if (comboKind === 'FOUR_BOMB' || comboKind === 'TRIPLE_BOMB') {
        this.handBombs[playerId].bombs++;
      }
    }

    if (this.state.status === "FINISHED") {
      this.previousWinnerId =
        this.state.finishOrder[0] ?? null;
      this.room.phase = "RESULTS";
      this.calculateScores();
    }

    this.broadcastViews();
    this.broadcastRoom();
    this.scheduleTurn();
    return true;
  }

  /** Per-hand scores for the just-finished hand (for result display). */
  private handScores: Record<string, number> = {};

  /** Calculate cumulative scores when a hand finishes. */
  private calculateScores(): void {
    if (!this.state || this.state.status !== "FINISHED") return;
    const n = this.room.playerCount;
    const placePoints = n === 4 ? [3, 2, 1, 0] : [2, 1, 0];

    this.handScores = {};
    this.state.finishOrder.forEach((playerId, idx) => {
      const place = placePoints[idx] ?? 0;
      const bombs = this.handBombs[playerId] ?? { bombs: 0, rockets: 0 };
      const bombBonus = bombs.bombs * 1 + bombs.rockets * 2;
      const handTotal = place + bombBonus;
      this.handScores[playerId] = handTotal;
      this.scores[playerId] = (this.scores[playerId] ?? 0) + handTotal;
    });
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
