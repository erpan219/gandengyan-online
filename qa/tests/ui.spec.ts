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

test.describe('phone landscape surface', () => {
  // A touch viewport also exercises the fallback in desktop browser projects;
  // do not depend on a particular mobile user-agent or native orientation API.
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('short landscape header fits optional information and a 600px tablet keeps its layout', async ({ app }) => {
    await app.configure('QA No Shuffle', 4, true);
    await app.page.locator('#btn-practice').click();
    await expect(app.cards).toHaveCount(14);
    for (const [width, height] of [[568, 280], [667, 300]]) {
      await app.page.setViewportSize({ width, height });
      await expect(app.page.locator('#game-viewport')).toHaveClass(/short-game/);
      const info = (await app.page.locator('#center-info').boundingBox())!;
      const top = (await app.page.locator('#seat-top').boundingBox())!;
      const buttons = (await app.page.locator('.top-right-btns').boundingBox())!;
      expect(info.x + info.width).toBeLessThan(top.x);
      expect(top.x + top.width).toBeLessThan(buttons.x);
      await expect(app.page.locator('#center-info')).toContainText('No-shuffle');
    }
    await app.page.setViewportSize({ width: 600, height: 960 });
    await expect(app.page.locator('#game-viewport')).not.toHaveClass(/phone-game/);
    await expect(app.page.locator('#game-viewport')).toHaveCSS('display', 'contents');
    await expect(app.cards).toHaveCount(14);
    await expect(app.play).toBeVisible();
  });

  for (const players of [3, 4] as const) {
    test(`${players} seats fit portrait fallback and native landscape with usable cards and controls`, async ({ app }, testInfo) => {
      // The viewport loop sits idle longer than the 30s turn timeout on slow
      // WebKit; without this, auto-play fires mid-test and changes the hand
      // the geometry assertions depend on. Set before the game starts so the
      // timeout is never armed. Scoped to this test only.
      await app.page.evaluate(() => { (window as any).__qaNoTurnTimeout = true; });
      await app.practice(players);
      const shell = app.page.locator('#game-viewport');
      await expect(shell).toHaveClass(/portrait-game/);
      const originalHand = await app.cardIds();

      const tapCard = async (id: string) => {
        const bounds = (await app.card(id).boundingBox())!;
        const rotated = await shell.evaluate(el => el.classList.contains('portrait-game'));
        // Tap the exposed index corner in screen coordinates after rotation.
        await app.page.touchscreen.tap(
          rotated ? bounds.x + bounds.width - 18 : bounds.x + 4,
          rotated ? bounds.y + 4 : bounds.y + 18,
        );
      };
      await tapCard('S-4');
      await expect(app.card('S-4')).toHaveAttribute('aria-pressed', 'true');

      for (const [width, height] of [[390, 844], [844, 390], [667, 375], [568, 320], [667, 300], [667, 280], [568, 280], [430, 932], [932, 430], [390, 844]]) {
        await app.page.setViewportSize({ width, height });
        await expect.poll(() => shell.evaluate(el => ({ width: el.clientWidth, height: el.clientHeight })))
          .toEqual({ width: Math.max(width, height), height: Math.min(width, height) });
        if (width < height) await expect(shell).toHaveClass(/portrait-game/);
        else await expect(shell).not.toHaveClass(/portrait-game/);
        await expect(app.card('S-4')).toHaveAttribute('aria-pressed', 'true');
        expect(await app.cardIds()).toEqual(originalHand);

        const geometry = await app.page.evaluate(() => {
          const viewport = document.getElementById('game-viewport')!;
          const surface = viewport.getBoundingClientRect();
          const rotated = viewport.classList.contains('portrait-game');
          const box = (el: Element) => {
            const r = el.getBoundingClientRect();
            const x = rotated ? r.top - surface.top : r.left - surface.left;
            const y = rotated ? surface.right - r.right : r.top - surface.top;
            const width = rotated ? r.height : r.width;
            const height = rotated ? r.width : r.height;
            return { x, y, width, height, right: x + width, bottom: y + height };
          };
          const select = (selector: string) => box(document.querySelector(selector)!);
          return {
            width: viewport.clientWidth, height: viewport.clientHeight,
            cards: [...document.querySelectorAll('#my-hand .card')].map(box),
            controls: [...document.querySelectorAll('#actions .act-btn')].map(box),
            left: select('#opp-left .opp'), right: select('#opp-right .opp'),
            center: select('#table-mid'), local: select('#my-info'),
            top: document.querySelector('#seat-top .opp') ? select('#seat-top .opp') : null,
          };
        });
        for (const box of [...geometry.cards, ...geometry.controls, geometry.left, geometry.right, geometry.local]) {
          expect(box.x, `${width}x${height}: left edge`).toBeGreaterThanOrEqual(-1);
          expect(box.y, `${width}x${height}: top edge`).toBeGreaterThanOrEqual(-1);
          expect(box.right, `${width}x${height}: right edge`).toBeLessThanOrEqual(geometry.width + 1);
          expect(box.bottom, `${width}x${height}: bottom edge`).toBeLessThanOrEqual(geometry.height + 1);
        }
        expect(geometry.cards.every(card => card.width >= 59 && card.height >= 83)).toBe(true);
        expect(geometry.controls.every(control => control.height >= 48)).toBe(true);
        expect(Math.min(...geometry.cards.map(card => card.y))).toBeGreaterThanOrEqual(Math.max(...geometry.controls.map(control => control.bottom)) - 1);
        expect(geometry.left.right).toBeLessThan(geometry.center.x);
        expect(geometry.right.x).toBeGreaterThan(geometry.center.right);
        expect(geometry.local.y).toBeGreaterThan(geometry.left.y);
        if (players === 4) {
          expect(geometry.top).not.toBeNull();
          expect(geometry.top!.bottom).toBeLessThanOrEqual(geometry.center.y);
          expect(geometry.top!.x).toBeGreaterThan(geometry.left.right);
          expect(geometry.top!.right).toBeLessThan(geometry.right.x);
        } else expect(geometry.top).toBeNull();
        await tapCard('S-5');
        await expect(app.card('S-5')).toHaveAttribute('aria-pressed', 'true');
        await tapCard('S-5');
        await expect(app.card('S-5')).toHaveAttribute('aria-pressed', 'false');
        await app.page.screenshot({ path: testInfo.outputPath(`${players}-players-${width}x${height}.png`) });
      }

      await app.page.locator('#btn-help2').click();
      const help = app.page.getByRole('dialog');
      await expect(help).toHaveAccessibleName('How to play');
      const helpBounds = (await help.boundingBox())!;
      expect(helpBounds.x).toBeGreaterThanOrEqual(-1);
      expect(helpBounds.y).toBeGreaterThanOrEqual(-1);
      expect(helpBounds.x + helpBounds.width).toBeLessThanOrEqual(391);
      expect(helpBounds.y + helpBounds.height).toBeLessThanOrEqual(845);
      await app.page.locator('#btn-help-close').click();
      await expect(app.card('S-4')).toHaveAttribute('aria-pressed', 'true');

      // The seeded deal contains a genuine eleven-card straight (4 through A). Verify its
      // actual play fan fits the smallest phone, rather than injecting a view.
      await app.page.setViewportSize({ width: 568, height: 320 });
      await expect(shell).toHaveClass(/^phone-game$/);
      await app.selectCards(['S-5', 'S-6', 'S-7', 'S-8', 'S-9', 'S-10', 'S-J', 'S-Q', 'S-K', 'S-A']);
      await app.play.click();
      const played = app.page.locator('.ts-bottom .table-cards:not(.leaving) .card');
      await expect(played).toHaveCount(11);
      // The fan settles within the deal animation on fast engines, but on slow
      // WebKit under harness load the same geometry can take longer to
      // observe; the assertion is that it FITS, so use the default budget.
      await expect.poll(async () => played.evaluateAll(cards => {
        const center = document.getElementById('center-table')!.getBoundingClientRect();
        return cards.every(card => {
          const r = card.getBoundingClientRect();
          return r.left >= center.left - 1 && r.right <= center.right + 1 && r.top >= center.top - 1 && r.bottom <= center.bottom + 1;
        });
      }), { timeout: 10_000 }).toBe(true);
      await app.page.screenshot({ path: testInfo.outputPath(`${players}-players-long-play-568x320.png`) });
      expect(app.wire.pageErrors).toEqual([]);
    });
  }
});
