import { test, expect, startBotRoom } from '../fixtures/browser';
import type { GameFrame, RoomFrame } from '../helpers/browser-protocol';

test('home exposes both player counts and validates a short room code without connecting', async ({ app }) => {
  await expect(app.page.locator('input[name="mode"]')).toHaveCount(2);
  await expect(app.page.locator('input[value="gdy3"]')).toBeChecked();
  await app.page.locator('#inp-code').fill('ABC');
  await app.page.locator('#btn-join').click();
  await expect(app.toast.last()).toContainText('Room not found');
  await expect(app.home).toBeVisible();
  await expect(app.page.locator('#btn-join')).toBeEnabled();
  expect(app.wire.connections).toBe(0);
});

for (const count of [3, 4] as const) {
  test(`create ${count}-seat room, fill AI seats and render the real private deal`, async ({ app }) => {
    const code = await app.createRoom('QA Host', count, true);
    expect(app.wire.room.roomCode).toBe(code);
    expect(app.wire.room.playerCount).toBe(count);
    expect(app.wire.room.seats.filter(seat => seat.playerId.startsWith('empty:'))).toHaveLength(count - 1);
    await expect(app.page.locator('#room-players .roster-row')).toHaveCount(count);
    await expect(app.page.locator('#room-players')).toContainText('QA Host');
    const initial = await app.startGame();
    expect(initial.view.revision).toBe(0);
    expect(initial.botIds).toHaveLength(count - 1);
    expect(initial.view.players.map(player => player.cardCount)).toEqual(count === 3 ? [18, 18, 18] : [14, 14, 13, 13]);
    expect(initial.view.players.reduce((sum, player) => sum + player.cardCount, 0)).toBe(54);
    await expect(app.opponents).toHaveCount(count - 1);
    // Wait for an actual actionable human turn, rather than sleeping for bots.
    await expect(app.page.locator('#turn-countdown')).toBeVisible({ timeout: 8_000 });
    await app.expectRenderedHandMatchesServer();
    await app.expectTurnMatchesServer();
    expect(app.wire.pageErrors).toEqual([]);
  });
}

test('leave waiting room clears token and a new room does not reclaim the old seat', async ({ app }) => {
  const oldCode = await app.createRoom('First Host');
  const oldPlayer = app.wire.playerId;
  await app.page.locator('#btn-leave-room').click();
  await expect(app.home).toBeVisible();
  await expect.poll(() => app.page.evaluate(() => localStorage.getItem('gdy_token'))).toBeNull();
  // Condition-based wait for the client's intentional 150ms close flush.
  await expect.poll(() => app.wire.closedConnections).toBe(1);
  const newCode = await app.createRoom('Second Host');
  expect(newCode).not.toBe(oldCode);
  await expect.poll(() => app.wire.playerId).not.toBe(oldPlayer);
  expect(app.wire.room.seats.filter(seat => !seat.playerId.startsWith('empty:'))).toHaveLength(1);
  expect(app.wire.sent.filter(message => message.type === 'LEAVE_ROOM')).toHaveLength(1);
});

test('unknown six-character room reports the server error without opening a room', async ({ app }) => {
  await app.page.locator('#inp-code').fill('ZZZZZZ');
  await app.page.locator('#btn-join').click();
  await app.wire.waitFor('ERROR', frame => frame.code === 'ROOM_NOT_FOUND');
  await expect(app.toast.last()).toHaveText('Room not found.');
  await expect(app.home).toBeVisible();
  expect(app.wire.latest<RoomFrame>('ROOM_STATE')).toBeUndefined();
});

test('failed join re-enables Join for correction', async ({ app }, testInfo) => {
  testInfo.annotations.push({ type: 'regression', description: 'Fixed 2026-10-11 (f35ce8e): terminal join errors (ROOM_NOT_FOUND/ROOM_FULL/SERVER_ERROR) and connect failures now clear the pending-join state via clearJoinTimer().' });
  await app.page.locator('#inp-code').fill('ZZZZZZ');
  await app.page.locator('#btn-join').click();
  await app.wire.waitFor('ERROR', frame => frame.code === 'ROOM_NOT_FOUND');
  await expect(app.page.locator('#btn-join')).toBeEnabled({ timeout: 2_000 });
});


test('AI room advances after the human action and preserves its remaining cards', async ({ app }) => {
  await startBotRoom(app);
  const before = app.wire.game.view.selfHand.length;
  const revision = app.wire.game.view.revision;
  let selected = 0;
  if (await app.hint.isVisible()) {
    await app.hint.click();
    selected = await app.hand.locator('.sel').count();
    expect(selected).toBeGreaterThan(0);
    await app.play.click();
  } else {
    // Random server deals can leave no legal response. Passing is a valid
    // human action and must also let the AI continue.
    await app.pass.click();
  }
  const accepted = await app.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision > revision);
  expect(accepted.view.selfHand).toHaveLength(before - selected);
  const afterAI = await app.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision > accepted.view.revision, { timeout: 5_000 });
  expect(afterAI.view.selfHand).toEqual(accepted.view.selfHand);
  await expect(app.cards).toHaveCount(before - selected);
});
