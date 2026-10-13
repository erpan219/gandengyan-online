import { test, expect } from '../fixtures/browser';

// Page global from client/dist/js/ui.js (top-level const, not on window).
declare const App: any;

// Settle flow: the end-of-round popup must say "You Win!" only when the
// player actually won (finishOrder[0] === mySeat), otherwise "Round ended".
// The score overlay must wait a few seconds so the final play stays visible.
test('settle: correct win/lose popup, delayed score overlay', async ({ app }) => {
  await app.practice(3);
  const page = app.page;
  const errs: string[] = [];
  page.on('pageerror', e => errs.push(e.message));

  // Play a full hand. Bots move on their own; act when it's our turn.
  let settled = false;
  for (let i = 0; i < 200 && !settled; i++) {
    if (await page.locator('.score-popup').count() > 0) { settled = true; break; }
    if (await app.hint.isVisible()) {
      await app.hint.click();
      await app.play.click();
    } else if (await app.pass.isVisible()) {
      await app.pass.click();
    }
    await page.waitForTimeout(250);
  }
  expect(settled).toBe(true);

  const iWon = await page.evaluate(() => {
    const v = App.view;
    return !!(v && v.result && v.result.finishOrder && v.result.finishOrder[0] === v.mySeat);
  });

  // 1. The popup matches the actual outcome.
  const popupText = await page.locator('.score-popup').innerText();
  if (iWon) {
    expect(popupText).toContain('You Win!');
  } else {
    expect(popupText).toContain('Round ended');
    expect(popupText).not.toContain('You Win!');
  }

  // 2. The score overlay is delayed — not visible immediately at settle.
  await expect(page.locator('#settle-overlay')).toBeHidden();

  // 3. After the delay it appears with the matching header.
  await expect(page.locator('#settle-overlay')).toBeVisible({ timeout: 8000 });
  const header = await page.locator('#settle-overlay h2').innerText();
  if (iWon) expect(header).toContain('🎉');
  else expect(header).toContain('😵');

  expect(errs).toEqual([]);
});
