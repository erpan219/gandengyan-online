import { test, expect } from '../fixtures/browser';

for (const players of [3, 4] as const) {
  test(`${players}-player practice deals every card and begins with human S-4 ownership`, async ({ app }) => {
    await app.practice(players);
    await expect(app.cards).toHaveCount(players === 3 ? 18 : 14);
    await expect(app.opponents).toHaveCount(players - 1);
    const counts = await app.page.locator('.opp .card-count-ring').allTextContents();
    expect(counts.map(Number)).toEqual(players === 3 ? [18, 18] : [13, 13, 14]);
    expect(counts.reduce((sum, value) => sum + Number(value), await app.cards.count())).toBe(54);
    expect(new Set(await app.cardIds()).size).toBe(await app.cards.count());
    await expect(app.card('S-4')).toBeVisible();
    await expect(app.pass).toBeDisabled();
    await expect(app.play).toBeDisabled();
    expect(app.wire.connections).toBe(0);
  });
}

test('pointer selection, legal preview and Hint lead to a real play and bot response', async ({ app }) => {
  await app.practice();
  // The exposed left edge belongs to this card even in a compressed fan.
  const card = app.card('S-4');
  await card.click({ position: { x: 4, y: 18 } });
  await expect(card).toHaveClass(/\bsel\b/);
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(app.page.locator('#actions .combo-preview')).toHaveText('Single');
  await app.hint.click();
  const selected = await app.hand.locator('.sel').count();
  expect(selected).toBeGreaterThan(0);
  await expect(app.play).not.toHaveAttribute('aria-disabled', 'true');
  const before = await app.cards.count();
  await app.play.click();
  await expect(app.cards).toHaveCount(before - selected);
  await expect(app.hand.locator('.sel')).toHaveCount(0);
  // Serverless AI acts through the shipped Game engine; wait on changed cards
  // or control ownership, never a guessed sleep for its random delay.
  await expect.poll(async () => {
    const counts = await app.page.locator('.opp .card-count-ring').allTextContents();
    return counts.some(value => Number(value) < 18) || await app.hint.isVisible();
  }, { timeout: 8_000, message: 'At least one AI response or all-pass turn return' }).toBe(true);
  expect(app.wire.pageErrors).toEqual([]);
});

test('cancelled Exit preserves the hand; confirmed Exit returns home', async ({ app }) => {
  await app.practice();
  const hand = await app.cardIds();
  app.page.once('dialog', dialog => dialog.dismiss());
  await app.page.locator('#btn-exit-game').click();
  await expect(app.gameScreen).toBeVisible();
  expect(await app.cardIds()).toEqual(hand);
  app.page.once('dialog', dialog => dialog.accept());
  await app.page.locator('#btn-exit-game').click();
  await expect(app.home).toBeVisible();
  await expect(app.page.locator('#settle-overlay')).toBeHidden();
});

test('hand and core controls remain within viewport at phone, tablet and desktop widths', async ({ app }, testInfo) => {
  await app.practice(4);
  for (const width of [360, 390, 768, 1280]) {
    await app.page.setViewportSize({ width, height: 900 });
    await expect(app.play).toBeVisible();
    const bounds = await app.cards.evaluateAll(cards => cards.map(card => {
      const r = card.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width };
    }));
    expect(bounds.every(card => card.x >= -1 && card.right <= width + 1 && card.width > 0), `Every card fits at ${width}px`).toBe(true);
    const playBounds = await app.play.boundingBox();
    expect(playBounds).not.toBeNull();
    expect(playBounds!.x).toBeGreaterThanOrEqual(0);
    expect(playBounds!.x + playBounds!.width).toBeLessThanOrEqual(width);
    const documentFits = await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(documentFits, `No page-level horizontal overflow at ${width}px`).toBe(true);
  }
  await testInfo.attach('responsive-table-state', { body: await app.page.screenshot({ fullPage: true }), contentType: 'image/png' });
});
