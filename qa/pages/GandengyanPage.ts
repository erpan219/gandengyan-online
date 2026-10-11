import { expect, type Locator, type Page } from '@playwright/test';
import { LobbyPage } from './LobbyPage';
import { GameTablePage } from './GameTablePage';
import { FrameJournal, type GameFrame, type RoomFrame } from '../helpers/browser-protocol';

/** POM for the deployed, checked-in client/dist UI (not the React prototype). */
export class GandengyanPage {
  readonly wire: FrameJournal;
  readonly lobby: LobbyPage;
  readonly table: GameTablePage;
  readonly home: Locator;
  readonly roomScreen: Locator;
  readonly gameScreen: Locator;
  readonly hand: Locator;
  readonly cards: Locator;
  readonly opponents: Locator;
  readonly play: Locator;
  readonly pass: Locator;
  readonly hint: Locator;
  readonly toast: Locator;

  constructor(readonly page: Page, readonly baseURL: string) {
    this.wire = new FrameJournal(page);
    this.lobby = new LobbyPage(page);
    this.table = new GameTablePage(page);
    this.home = this.lobby.home;
    this.roomScreen = this.lobby.room;
    this.gameScreen = this.table.screen;
    this.hand = this.table.hand;
    this.cards = this.table.cards;
    this.opponents = this.table.opponents;
    this.play = page.locator('#actions [data-act="play"]');
    this.pass = page.locator('#actions [data-act="pass"]');
    this.hint = page.locator('#actions [data-act="hint"]');
    this.toast = page.locator('#toast-wrap .toast');
  }

  async open(): Promise<void> {
    await this.page.goto(this.baseURL);
    await expect(this.home).toBeVisible();
    await expect(this.page.locator('#t-title')).toHaveText('Gandengyan');
  }

  async configure(name: string, players: 3 | 4 = 3, noShuffle = false): Promise<void> {
    await this.lobby.configure(name, players, noShuffle);
  }

  async createRoom(name: string, players: 3 | 4 = 3, noShuffle = false): Promise<string> {
    await this.configure(name, players, noShuffle);
    await this.page.locator('#btn-create').click();
    await expect(this.roomScreen).toBeVisible();
    await this.lobby.expectRoomCode();
    await this.wire.waitFor<RoomFrame>('ROOM_STATE', frame => frame.phase === 'LOBBY');
    return (await this.page.locator('#room-code').innerText()).trim();
  }

  async joinRoom(code: string, name: string, viaEnter = false): Promise<void> {
    await this.page.locator('#inp-name').fill(name);
    await this.page.locator('#inp-code').fill(code);
    if (viaEnter) await this.page.locator('#inp-code').press('Enter');
    else await this.page.locator('#btn-join').click();
    await this.wire.waitFor<RoomFrame>('ROOM_STATE', frame => frame.roomCode === code.toUpperCase());
    await expect(this.page.locator('.screen.active')).toHaveAttribute('id', /screen-(room|game)/);
  }

  async startGame(): Promise<GameFrame> {
    await this.page.locator('#btn-start').click();
    const first = await this.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.status === 'PLAYING');
    await expect(this.gameScreen).toBeVisible();
    return first;
  }

  async practice(players: 3 | 4 = 3): Promise<void> {
    await this.configure('QA Practice', players);
    await this.page.locator('#btn-practice').click();
    await expect(this.gameScreen).toBeVisible();
    await expect(this.cards).toHaveCount(players === 3 ? 18 : 14);
  }

  card(id: string): Locator { return this.hand.locator(`[data-id="${id}"]`); }
  async cardIds(): Promise<string[]> { return this.cards.evaluateAll(cards => cards.map(card => card.getAttribute('data-id')!)); }

  /** Use the application's real keyboard handler: overlap makes center clicks
   * ambiguous. Pointer geometry has its own independent test in ui.spec.ts. */
  async selectCards(ids: string[]): Promise<void> {
    for (const id of ids) {
      const card = this.card(id);
      await card.focus();
      await card.press('Enter');
      await expect(card).toHaveAttribute('aria-pressed', 'true');
    }
  }

  async playCards(ids: string[]): Promise<GameFrame> {
    const revision = this.wire.game.view.revision;
    await this.selectCards(ids);
    await expect(this.play).toBeEnabled();
    await expect(this.play).not.toHaveAttribute('data-invalid', '1');
    await this.play.click();
    return this.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision > revision);
  }

  async passTurn(): Promise<GameFrame> {
    const revision = this.wire.game.view.revision;
    await expect(this.pass).toBeEnabled();
    await this.pass.click();
    return this.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision > revision);
  }

  async expectRenderedHandMatchesServer(): Promise<void> {
    await expect.poll(async () => (await this.cardIds()).sort(), { message: 'Rendered own cards match latest private server view' })
      .toEqual([...this.wire.game.view.selfHand].sort());
  }

  async expectTurnMatchesServer(): Promise<void> {
    const view = this.wire.game.view;
    const activeSeat = view.players.findIndex(player => player.id === view.currentPlayerId);
    if (view.currentPlayerId === view.selfId) {
      await expect(this.page.locator('#turn-countdown')).toBeVisible();
      await expect(this.opponents.filter({ has: this.page.locator('.timer') })).toHaveCount(0);
    } else {
      await expect(this.page.locator(`.opp[data-seat="${activeSeat}"]`)).toHaveClass(/\bturn\b/);
      await expect(this.page.locator('#actions [data-act="play"]')).toHaveCount(0);
    }
  }

  async closeTransport(): Promise<void> {
    // QA init script retains only actual native socket objects. No fake messages,
    // game state setters or production modifications are involved.
    await this.page.evaluate(() => {
      const sockets = (window as unknown as { __qaSockets: WebSocket[] }).__qaSockets;
      for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.close(4001, 'QA transport interruption');
    });
  }
}
