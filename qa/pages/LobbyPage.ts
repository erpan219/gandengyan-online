import { expect, type Locator, type Page } from '@playwright/test';

/** Stable selectors for the actual shipped home and waiting-room screens. */
export class LobbyPage {
  readonly home: Locator;
  readonly room: Locator;
  readonly name: Locator;
  readonly code: Locator;
  readonly create: Locator;
  readonly join: Locator;
  readonly start: Locator;
  constructor(readonly page: Page) {
    this.home = page.locator('#screen-home');
    this.room = page.locator('#screen-room');
    this.name = page.locator('#inp-name');
    this.code = page.locator('#inp-code');
    this.create = page.locator('#btn-create');
    this.join = page.locator('#btn-join');
    this.start = page.locator('#btn-start');
  }
  async configure(name: string, players: 3 | 4, noShuffle: boolean): Promise<void> {
    await this.name.fill(name);
    await this.page.locator(`input[name="mode"][value="gdy${players}"]`).check();
    await this.page.locator('#opt-noshuffle').setChecked(noShuffle);
  }
  async expectRoomCode(): Promise<string> {
    const code = this.page.locator('#room-code');
    await expect(code).toHaveText(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    return (await code.innerText()).trim();
  }
}
