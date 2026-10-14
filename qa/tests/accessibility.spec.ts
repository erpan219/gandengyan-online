import { test, expect, startHumanRoom } from '../fixtures/browser';

// Page global from client/dist/js/ui.js (top-level const, not on window).
declare const App: any;

test('help dialog supports keyboard open, focus containment, Escape and focus return', async ({ app }) => {
  const opener = app.page.locator('#btn-help');
  await opener.focus();
  await opener.press('Enter');
  const dialog = app.page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const close = app.page.locator('#btn-help-close');
  await expect(close).toBeFocused();
  await app.page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await app.page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await app.page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('hand cards expose button semantics, descriptive labels and pressed state across keyboard rerenders', async ({ app }) => {
  await app.practice();
  const card = app.card('S-4');
  await expect(card).toHaveAttribute('role', 'button');
  await expect(card).toHaveAttribute('tabindex', '0');
  await expect(card).toHaveAccessibleName('4 of Spades');
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await card.focus();
  await card.press('Enter');
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toHaveAccessibleName('4 of Spades, selected');
  await card.press('Space');
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await expect(app.play).toBeDisabled();
});

test('invalid card combination has a live status explanation and aria-disabled play control', async ({ app }) => {
  await app.practice();
  await app.selectCards(['S-4', 'S-6']);
  await expect(app.page.getByRole('status')).toHaveText('Invalid combination');
  await expect(app.play).toHaveAttribute('aria-disabled', 'true');
  await expect(app.play).toHaveAttribute('data-invalid', '1');
  await expect(app.cards).toHaveCount(18);
});

test('home nickname and room-code inputs have programmatic labels', async ({ app }, testInfo) => {
  testInfo.annotations.push({ type: 'regression', description: 'Fixed 2026-10-11 (f35ce8e): label#t-name now has for="inp-name"; label#t-join now has for="inp-code".' });
  await expect(app.page.locator('#inp-name')).toHaveAccessibleName(/.+/, { timeout: 2_000 });
  await expect(app.page.locator('#inp-code')).toHaveAccessibleName(/.+/, { timeout: 2_000 });
});

test('help dialog has a programmatic accessible title', async ({ app }, testInfo) => {
  testInfo.annotations.push({ type: 'regression', description: 'Fixed 2026-10-11 (f35ce8e): #help-modal now has aria-labelledby="t-help-title".' });
  await app.page.locator('#btn-help').click();
  await expect(app.page.getByRole('dialog')).toHaveAccessibleName('How to play', { timeout: 2_000 });
});

test('icon-only controls expose accessible names', async ({ app }) => {
  // PR6 targeted a11y: every icon-only button needs a programmatic name.
  // The fixture sets ddz_lang=en, so assert the English labels.
  await expect(app.page.locator('#btn-bgm')).toHaveAccessibleName('Background music');
  await expect(app.page.locator('#btn-snd')).toHaveAccessibleName('Sound effects');
  // Help-close lives inside the hidden help modal: open it first so the
  // accessible name computes.
  await app.page.locator('#btn-help').click();
  await expect(app.page.locator('#btn-help-close')).toHaveAccessibleName('Close');
  await app.page.locator('#btn-help-close').click();
  // Chat and exit-game buttons live on the game screen: enter practice.
  // (#btn-chat is display:none in practice/local mode — chat is online-only —
  // so assert its programmatic label via attribute, not computed name.)
  await app.practice();
  await expect(app.page.locator('#btn-chat')).toHaveAttribute('aria-label', 'Chat');
  await expect(app.page.locator('#btn-exit-game')).toHaveAccessibleName('Exit game');
});

// --- UI/UX pass 2026-10-13 (ux-ui-agent-skills redesign-audit) ---
// Landmarks, skip link, toast live region, focus-visible ring.

test('skip link, main landmark, toast live region and name autocomplete', async ({ app }) => {
  const page = app.page;
  await expect(page.locator('main#main-content')).toBeVisible();
  const skip = page.locator('.skip-link');
  await expect(skip).toHaveAttribute('href', '#main-content');
  await expect(page.locator('#toast-wrap')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#inp-name')).toHaveAttribute('autocomplete', 'name');
  // First Tab stop is the skip link and it shows a visible focus ring.
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate(el => getComputedStyle(el).outlineWidth);
  expect(outline).toBe('2px');
});

test('arrow keys move focus between hand cards', async ({ app }) => {
  await app.practice();
  const cards = app.page.locator('#my-hand .card');
  await expect(cards).toHaveCount(18);
  await cards.first().focus();
  await expect(cards.first()).toBeFocused();
  await app.page.keyboard.press('ArrowRight');
  await expect(cards.nth(1)).toBeFocused();
  await app.page.keyboard.press('ArrowLeft');
  await expect(cards.first()).toBeFocused();
});

test('reduced motion stops the turn-pulse animation', async ({ app }) => {
  await app.page.emulateMedia({ reducedMotion: 'reduce' });
  await app.practice();
  // Play the forced lead so the turn passes to a bot panel.
  // (playCards needs server GAME_STATE frames; practice is local.)
  await app.selectCards(['S-4']);
  await app.play.click();
  const turnPanel = app.page.locator('.opp.turn');
  await expect(turnPanel).toBeVisible({ timeout: 5000 });
  const anim = await turnPanel.evaluate(el => getComputedStyle(el).animationName);
  expect(anim).toBe('none');
});

test('chat pop toggles aria-expanded, focuses first phrase, Escape closes and returns focus', async ({ createPlayers }) => {
  const players = await createPlayers(3);
  await startHumanRoom(players);
  const sender = players[0].app;
  const chatBtn = sender.page.locator('#btn-chat');
  await expect(chatBtn).toHaveAttribute('aria-expanded', 'false');
  await chatBtn.click();
  await expect(chatBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(sender.page.locator('#chat-pop [data-chat="0"]')).toBeFocused();
  await sender.page.keyboard.press('Escape');
  await expect(sender.page.locator('#chat-pop')).toBeHidden();
  await expect(chatBtn).toHaveAttribute('aria-expanded', 'false');
  await expect(chatBtn).toBeFocused();
});

test('settle overlay is a dialog with focus management, Tab trap and Escape to play again', async ({ app }) => {
  await app.practice(3);
  const page = app.page;
  // Play a full hand (same loop as settle-flow.spec.ts).
  let settled = false;
  for (let i = 0; i < 400 && !settled; i++) {
    settled = await page.evaluate(() => App.view?.state === 'settle');
    if (settled) break;
    if (await app.hint.isVisible()) {
      await app.hint.click();
      await app.play.click();
    } else if (await app.pass.isVisible()) {
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

  const overlay = page.locator('#settle-overlay');
  await expect(overlay).toBeVisible({ timeout: 8000 });
  await expect(overlay).toHaveAttribute('role', 'dialog');
  await expect(overlay).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#btn-again')).toBeFocused();
  // Tab trap: Shift+Tab from the first button wraps to the last.
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#btn-settle-home')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#btn-again')).toBeFocused();
  // Escape takes the primary action: a new hand is dealt.
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  await expect(app.cards).toHaveCount(18);
});

test('turn changes are announced in a polite live region', async ({ app }) => {
  await app.practice();
  const announcer = app.page.locator('#turn-announcer');
  await expect(announcer).toHaveAttribute('aria-live', 'polite');
  // Fixed RNG: the S-4 holder (me) leads, so the first announcement is mine.
  await expect(announcer).toHaveText('Your turn');
  await app.selectCards(['S-4']);
  await app.play.click();
  // Turn passes to a bot; the announcer names them.
  await expect(announcer).toHaveText(/is thinking…/);
});
