import { test, expect } from '../fixtures/browser';

// Doudizhu-style table transitions:
// 1. A beaten play fades/slides out (ghost) while the new play deals in.
// 2. Pass bubbles pop in, linger ~1.6s, then fade out (CSS-driven).
test('table transitions: beaten play fades out, pass bubble fades', async ({ app }) => {
  await app.practice(3);
  const page = app.page;
  // WebKit's click-stability checks can stall 6s+ per click; without this,
  // the 30s server turn timeout fires mid-test and auto-play takes over,
  // detaching the Play button so later clicks time out. Same guard as the
  // phone-landscape and online-language tests.
  await page.evaluate(() => { (window as any).__qaNoTurnTimeout = true; });
  const errs: string[] = [];
  page.on('pageerror', e => errs.push(e.message));

  // 1. Ghost fade: play via hint until a bot beats the play, replacing it.
  let ghostSeen = false;
  for (let i = 0; i < 12 && !ghostSeen; i++) {
    if (await app.hint.isVisible()) {
      await app.hint.click({ force: true });
      await app.play.click({ force: true });
      try {
        // NOTE: waitForFunction(fn, arg, options) — the timeout MUST be the
        // third arg. Passing it second silently makes it the (ignored) arg
        // and the wait falls back to the 30s default, long enough for the
        // server turn timeout to auto-play the hand mid-test.
        await page.waitForFunction(
          () => document.querySelectorAll('.table-cards.leaving').length > 0,
          null,
          { timeout: 5000 },
        );
        ghostSeen = true;
      } catch { /* this play wasn't beaten; keep going */ }
    } else if (await app.pass.isVisible()) {
      await app.pass.click({ force: true });
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
