import { test, expect, startHumanRoom } from '../fixtures/browser';

test('home language switches both ways, updates document language and survives reload', async ({ app }) => {
  await expect(app.page.locator('html')).toHaveAttribute('lang', 'en');
  await app.page.locator('#btn-lang').click();
  await expect(app.page.locator('#t-title')).toHaveText('干瞪眼');
  await expect(app.page.locator('#t-bcreate')).toHaveText('创建房间');
  await expect(app.page.locator('html')).toHaveAttribute('lang', 'zh');
  await app.page.reload();
  await expect(app.page.locator('#t-title')).toHaveText('干瞪眼');
  await app.page.locator('#btn-lang').click();
  await expect(app.page.locator('#t-bpractice')).toHaveText('Practice vs AI');
  await expect(app.page.locator('html')).toHaveAttribute('lang', 'en');
});

test('practice language changes mid-hand without losing selected cards or turn', async ({ app }) => {
  await app.practice();
  const hand = await app.cardIds();
  await app.selectCards(['S-4']);
  await app.page.locator('#btn-lang2').click();
  await expect(app.play).toHaveText('出牌');
  await expect(app.hint).toHaveText('提示');
  await expect(app.page.locator('#center-info')).toContainText('第 1 局');
  await expect(app.card('S-4')).toHaveAttribute('aria-pressed', 'true');
  expect(await app.cardIds()).toEqual(hand);
  await expect(app.pass).toBeDisabled();
  await app.page.locator('#btn-lang2').click();
  await expect(app.play).toHaveText('Play');
  await expect(app.page.locator('#actions .combo-preview')).toHaveText('Single');
  await expect(app.card('S-4')).toHaveAttribute('aria-pressed', 'true');
});

test('online language changes are local to one player and preserve the real session', async ({ createPlayers }) => {
  const players = await createPlayers(3);
  await startHumanRoom(players);
  const leader = players.find(player => player.app.wire.game.view.currentPlayerId === player.app.wire.playerId)!.app;
  const other = players.find(player => player.app !== leader)!.app;
  const before = leader.wire.game;
  const hand = await leader.cardIds();
  const sent = leader.wire.sent.length;
  await leader.selectCards(['S-4']);
  await leader.page.locator('#btn-lang2').click();
  await expect(leader.play).toHaveText('出牌');
  await expect(leader.page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(other.page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(leader.card('S-4')).toHaveAttribute('aria-pressed', 'true');
  expect(await leader.cardIds()).toEqual(hand);
  expect(leader.wire.game.view.gameId).toBe(before.view.gameId);
  expect(leader.wire.game.view.revision).toBe(before.view.revision);
  expect(leader.wire.sent.slice(sent).filter(frame => ['PLAY_CARDS', 'PASS', 'CREATE_ROOM', 'JOIN_ROOM'].includes(String(frame.type)))).toEqual([]);
  await leader.page.locator('#btn-lang2').click();
  await expect(leader.play).toHaveText('Play');
  await leader.play.click();
  await expect(leader.cards).toHaveCount(17);
});
