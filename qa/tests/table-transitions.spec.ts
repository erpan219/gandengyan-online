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

  // Ghost detection: observe for `.leaving` across the WHOLE loop instead of
  // a per-round 5s wait. The ghost lives only ~400ms, and on slow WebKit the
  // bots can act after a per-round window closes — the wait then expires
  // while the ghost appears during the next iteration's clicks, and the
  // test misses it. A MutationObserver catches the ghost whenever it
  // appears, regardless of round timing.
  await page.evaluate(() => {
    (window as any).__ghostSeen = false;
    const obs = new MutationObserver(() => {
      if (document.querySelector('.table-cards.leaving')) (window as any).__ghostSeen = true;
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    (window as any).__ghostObs = obs;
  });

  // 1. Ghost fade: play via hint until a bot beats the play, replacing it.
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => (window as any).__ghostSeen === true)) break;
    if (await app.hint.isVisible()) {
      await app.hint.click({ force: true });
      await app.play.click({ force: true });
      // Let the bots act; the observer catches any ghost that appears.
      await page.waitForTimeout(2000);
    } else if (await app.pass.isVisible()) {
      await app.pass.click({ force: true });
      await page.waitForTimeout(800);
    } else {
      await page.waitForTimeout(800);
    }
  }
  const ghostSeen = await page.evaluate(() => {
    const seen = (window as any).__ghostSeen === true;
    (window as any).__ghostObs?.disconnect();
    return seen;
  });
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
