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
  // The client-side turn timeout is disarmed per page (the shared fixture
  // never sets this, so other tests still exercise the real timeout). It
  // does NOT stop the server's own 30s human timeout, which is authoritative
  // for online rooms — so the language clicks below use force: on
  // mobile-webkit the stability wait stalls 10s+ per click (the button's box
  // is stable; verified by probe), which alone blows the server budget and
  // lets auto-play move the game underneath the assertions. Force still
  // dispatches a real click; the test verifies the language effect, not
  // click latency.
  for (const player of players) {
    await player.app.page.evaluate(() => { (window as any).__qaNoTurnTimeout = true; });
  }
  await startHumanRoom(players);
  const leader = players.find(player => player.app.wire.game.view.currentPlayerId === player.app.wire.playerId)!.app;
  const other = players.find(player => player.app !== leader)!.app;
  const before = leader.wire.game;
  const hand = await leader.cardIds();
  const sent = leader.wire.sent.length;
  await leader.selectCards(['S-4']);
  await leader.page.locator('#btn-lang2').click({ force: true });
  await expect(leader.play).toHaveText('出牌');
  await expect(leader.page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(other.page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(leader.card('S-4')).toHaveAttribute('aria-pressed', 'true');
  expect(await leader.cardIds()).toEqual(hand);
  expect(leader.wire.game.view.gameId).toBe(before.view.gameId);
  expect(leader.wire.game.view.revision).toBe(before.view.revision);
  expect(leader.wire.sent.slice(sent).filter(frame => ['PLAY_CARDS', 'PASS', 'CREATE_ROOM', 'JOIN_ROOM'].includes(String(frame.type)))).toEqual([]);
  await leader.page.locator('#btn-lang2').click({ force: true });
  await expect(leader.play).toHaveText('Play');
  await leader.play.click();
  await expect(leader.cards).toHaveCount(17);
});

test('every classifier combo kind has a localized name in both locales (no raw-key leak)', async ({ app }) => {
  // The classifier emits SINGLE/PAIR/STRAIGHT/PAIR_RUN/TRIPLE_BOMB/FOUR_BOMB/
  // ROCKET; the UI maps kind -> c_<type>. A missing key used to leak the raw
  // key (e.g. "c_pair_run") into the opponent combo badge.
  const kinds = ['single', 'pair', 'straight', 'pair_run', 'triplebomb', 'fourbomb', 'rocket'];
  const resolveAll = () => app.page.evaluate(kinds => kinds.map(k => (window as any).t('c_' + k)), kinds);
  const namesEn = await resolveAll();
  for (const [i, k] of kinds.entries()) expect(namesEn[i]).not.toBe('c_' + k);
  expect(namesEn[kinds.indexOf('straight')]).toBe('Straight');
  expect(namesEn[kinds.indexOf('pair_run')]).toBe('Pair run');
  await app.page.locator('#btn-lang').click();
  const namesZh = await resolveAll();
  for (const [i, k] of kinds.entries()) expect(namesZh[i]).not.toBe('c_' + k);
  expect(namesZh[kinds.indexOf('straight')]).toBe('顺子');
  expect(namesZh[kinds.indexOf('pair_run')]).toBe('连对');
});
