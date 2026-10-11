import { test, expect } from '../fixtures/browser';

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
