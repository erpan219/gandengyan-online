import { test, expect } from '../fixtures/browser';

// Doudizhu-style table transitions:
// 1. A beaten play fades/slides out (ghost) while the new play deals in.
// 2. Pass bubbles pop in, linger ~1.6s, then fade out (CSS-driven).
test('table transitions: beaten play fades out, pass bubble fades', async ({ app }) => {
  await app.practice(3);
  const page = app.page;
  const errs: string[] = [];
  page.on('pageerror', e => errs.push(e.message));

  // 1. Ghost fade: play via hint until a bot beats the play, replacing it.
  let ghostSeen = false;
  for (let i = 0; i < 12 && !ghostSeen; i++) {
    if (await app.hint.isVisible()) {
      await app.hint.click();
      await app.play.click();
      try {
        await page.waitForFunction(
          () => document.querySelectorAll('.table-cards.leaving').length > 0,
          { timeout: 5000 },
        );
        ghostSeen = true;
      } catch { /* this play wasn't beaten; keep going */ }
    } else if (await app.pass.isVisible()) {
      await app.pass.click();
      await page.waitForTimeout(400);
    } else {
      await page.waitForTimeout(800);
    }
  }
  expect(ghostSeen).toBe(true);

  // 2. Pass fade: verify the CSS schedules pop-in + delayed fade-out.
  // (In live flow bots usually act before the 1.7s linger elapses, so check
  // the mechanism directly — it's deterministic.)
  const passAnim = await page.evaluate(() => {
    const center = document.querySelector('#center-table');
    if (!center) return null;
    const spot = document.createElement('div');
    spot.className = 'table-spot ts-bottom';
    const pass = document.createElement('div');
    pass.className = 'table-pass';
    pass.textContent = 'test';
    spot.appendChild(pass);
    center.appendChild(spot);
    const cs = getComputedStyle(pass);
    const out = { names: cs.animationName, delays: cs.animationDelay };
    spot.remove();
    return out;
  });
  expect(passAnim).not.toBeNull();
  expect(passAnim!.names).toContain('passFadeOut');
  expect(passAnim!.names).toContain('passIn');

  expect(errs).toEqual([]);
});
