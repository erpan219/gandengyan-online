import type { Locator, Page } from '@playwright/test';

/** Card interaction is scoped to the hand; descriptive table cards must never
 * be mistaken for actionable hand cards with the same data-id. */
export class GameTablePage {
  readonly screen: Locator;
  readonly hand: Locator;
  readonly cards: Locator;
  readonly opponents: Locator;
  readonly play: Locator;
  readonly pass: Locator;
  readonly hint: Locator;
  constructor(readonly page: Page) {
    this.screen = page.locator('#screen-game');
    this.hand = page.locator('#my-hand');
    this.cards = this.hand.locator('.card[data-id]');
    this.opponents = page.locator('.opp[data-seat]');
    this.play = page.locator('#actions [data-act="play"]');
    this.pass = page.locator('#actions [data-act="pass"]');
    this.hint = page.locator('#actions [data-act="hint"]');
  }
  card(id: string): Locator { return this.hand.locator(`[data-id="${id}"]`); }
  async cardIds(): Promise<string[]> { return this.cards.evaluateAll(cards => cards.map(card => card.getAttribute('data-id')!)); }
}
