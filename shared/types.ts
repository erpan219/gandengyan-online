export type NaturalRank = '4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A'|'2'|'3';
export type Rank = NaturalRank | 'SJ' | 'BJ';
export type Suit = 'S'|'H'|'C'|'D';
export type CardId = `${Suit}-${NaturalRank}` | 'SJ' | 'BJ';
export type PlayerId = string;
export type Card =
  | { id: `${Suit}-${NaturalRank}`; rank: NaturalRank; suit: Suit }
  | { id: 'SJ'|'BJ'; rank: 'SJ'|'BJ'; suit: null };
export type Kind = 'SINGLE'|'PAIR'|'STRAIGHT'|'PAIR_RUN'
  | 'TRIPLE_BOMB'|'FOUR_BOMB'|'ROCKET';
export interface Combination {
  kind: Kind;
  cardIds: CardId[];
  cardCount: number;
  /** Rank index, sequence start index, or 0 for ROCKET. */
  strength: number;
}
export interface LastPlay { playerId: PlayerId; combination: Combination }
export interface GameState {
  rulesVersion: 'gdy-custom-1.0.0';
  gameId: string;
  handNumber: number;
  playerCount: 3|4;
  revision: number;
  /** Counterclockwise fixed seat order. 固定逆时针座位顺序。 */
  seatOrder: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  currentPlayerId: PlayerId|null;
  lastPlay: LastPlay|null;
  passedSinceLastPlay: PlayerId[];
  /** Physical ownership zones. lastPlay references trickCards. */
  trickCards: CardId[];
  discard: CardId[];
  /** First element is the winner; auto-append last place at hand end. */
  finishOrder: PlayerId[];
  status: 'PLAYING'|'FINISHED'|'INTERRUPTED';
}
export interface MatchState {
  matchId: string;
  seatOrder: PlayerId[];
  previousWinnerId: PlayerId|null;
  completedHands: number;
  currentGame: GameState|null;
}
export type Action =
  | { type:'PLAY'; actionId:string; gameId:string; expectedRevision:number; cardIds:CardId[] }
  | { type:'PASS'; actionId:string; gameId:string; expectedRevision:number };
/** Actor identity is authenticated separately, never trusted from payload. */
export interface ActorContext { playerId: PlayerId; source: 'HUMAN'|'BOT'|'TIMEOUT' }
export type RuleError = 'EMPTY_SELECTION'|'DUPLICATE_CARD'|'UNKNOWN_CARD'
  | 'NOT_YOUR_TURN'|'CARD_NOT_OWNED'|'INVALID_COMBINATION'|'DOES_NOT_BEAT'
  | 'PASS_ON_FREE_LEAD'|'HAND_NOT_PLAYING'|'STALE_REVISION'|'WRONG_GAME'
  | 'DUPLICATE_ACTION_CONFLICT';
export type Classification = { ok:true; combination:Combination }
  | { ok:false; code:RuleError };
export type EngineResult =
  | { ok:true; state:GameState; events:DomainEvent[] }
  | { ok:false; code:RuleError; state:GameState };
export type DomainEvent =
  | { type:'PLAY_ACCEPTED'; playerId:PlayerId; combination:Combination }
  | { type:'PASS_ACCEPTED'; playerId:PlayerId }
  | { type:'PLAYER_FINISHED'; playerId:PlayerId; place:number }
  | { type:'TRICK_CLOSED'; leaderId:PlayerId }
  | { type:'HAND_FINISHED'; finishOrder:PlayerId[] };
export interface PlayerView {
  rulesVersion:string; gameId:string; revision:number;
  selfId:PlayerId; selfHand:CardId[];
  players:Array<{id:PlayerId; cardCount:number; place:number|null}>;
  currentPlayerId:PlayerId|null; lastPlay:LastPlay|null;
  passedSinceLastPlay:PlayerId[];
  finishOrder:PlayerId[]; status:GameState['status'];
}
/** Inject an already shuffled full deck; startSeatIndex affects dealing only. */
export declare function dealCards(deck:CardId[], seats:PlayerId[], startSeatIndex:number):Record<PlayerId,CardId[]>;
export declare function createDeck():Card[];
export declare function classifyHand(cards:CardId[], playerCount:3|4):Classification;
export declare function canBeat(candidate:Combination, target:Combination):boolean;
export declare function getLegalMoves(view:PlayerView, playerCount:3|4):Combination[];
export declare function applyAction(state:GameState, action:Action, actor:ActorContext):EngineResult;
export declare function nextActiveAfter(state:GameState, actorId:PlayerId):PlayerId;
export declare function getPlayerView(state:GameState, playerId:PlayerId):PlayerView;
