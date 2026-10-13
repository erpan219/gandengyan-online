import { test, expect } from '../fixtures/browser';

// Page global from client/dist/js/ui.js (top-level const, not on window).
declare const App: any;

// Settle flow: the end-of-round popup must say "You Win!" only when the
// player actually won (finishOrder[0] === mySeat), otherwise "Round ended".
// The score overlay must wait a few seconds so the final play stays visible.
//
// The settle popup lives only ~1600ms, so on slow devices the test can miss
// it by polling. Instead a MutationObserver records every popup as it appears,
// and the test plays until the view reaches settle state.
test('settle: correct win/lose popup, delayed score overlay', async ({ app }) => {
  await app.practice(3);
  const page = app.page;
  const errs: string[] = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.evaluate(() => {
    (window as any).__seenPopups = [];
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          const el = node as HTMLElement;
          if (el.classList && el.classList.contains('score-popup')) {
            (window as any).__seenPopups.push(el.textContent);
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });

  // Play a full hand. Bots move on their own; act when it's our turn.
  let settled = false;
  for (let i = 0; i < 400 && !settled; i++) {
    settled = await page.evaluate(() => App.view?.state === 'settle');
    if (settled) break;
    if (await app.hint.isVisible()) {
      await app.hint.click();
      await app.play.click();
    } else if (await app.pass.isVisible()) {
      // Pass renders disabled on a free lead (must play) and can linger
      // disabled across a turn change. Check the DOM state instantly
      // (isEnabled() would wait for the button to exist) and only click
      // when it is actually enabled.
      const enabled = await page.evaluate(() => {
        const b = document.querySelector('#actions [data-act="pass"]');
        return !!(b && !(b as HTMLButtonElement).disabled);
      });
      if (enabled) {
        try { await app.pass.click({ timeout: 1000 }); } catch { /* raced a turn change; keep polling */ }
      }
    }
    await page.waitForTimeout(250);
  }
  expect(settled).toBe(true);

  const iWon = await page.evaluate(() => {
    const v = App.view;
    return !!(v && v.result && v.result.finishOrder && v.result.finishOrder[0] === v.mySeat);
  });

  // 1. The recorded popup matches the actual outcome.
  const popups = await page.evaluate(() => (window as any).__seenPopups as string[]);
  expect(popups.length).toBeGreaterThan(0);
  const popupText = popups[popups.length - 1];
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
