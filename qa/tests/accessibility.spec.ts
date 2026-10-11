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

test('home nickname and room-code inputs have programmatic labels @known-issue', async ({ app }, testInfo) => {
  testInfo.annotations.push({ type: 'known-issue', description: 'aff6d61: visible field-label elements are missing for/id association; nickname input has no accessible name.' });
  await expect(app.page.locator('#inp-name')).toHaveAccessibleName(/.+/, { timeout: 2_000 });
  await expect(app.page.locator('#inp-code')).toHaveAccessibleName(/.+/, { timeout: 2_000 });
});

test('help dialog has a programmatic accessible title @known-issue', async ({ app }, testInfo) => {
  testInfo.annotations.push({ type: 'known-issue', description: 'aff6d61: help modal has role and aria-modal but no aria-labelledby or aria-label.' });
  await app.page.locator('#btn-help').click();
  await expect(app.page.getByRole('dialog')).toHaveAccessibleName('How to play', { timeout: 2_000 });
});
