import { test, expect, startHumanRoom } from '../fixtures/browser';
import type { GameFrame } from '../helpers/browser-protocol';

for (const count of [3, 4] as const) {
  test(`${count} isolated contexts share a room while each receives only its own hand @key-flow`, async ({ createPlayers }) => {
    const players = await createPlayers(count);
    await startHumanRoom(players, count);
    const frames = players.map(player => player.app.wire.game);
    expect(new Set(frames.map(frame => frame.view.gameId)).size).toBe(1);
    expect(new Set(frames.map(frame => frame.view.selfId)).size).toBe(count);
    const cards = frames.flatMap(frame => frame.view.selfHand);
    expect(cards).toHaveLength(54);
    expect(new Set(cards).size).toBe(54);
    const leader = frames.find(frame => frame.view.selfHand.includes('S-4'))!;
    for (const player of players) {
      expect(player.app.wire.game.view.currentPlayerId).toBe(leader.view.selfId);
      expect(player.app.wire.game.botIds).toEqual([]);
      expect(player.app.wire.game.view.players.every(publicPlayer => !('hand' in publicPlayer) && !('selfHand' in publicPlayer))).toBe(true);
      await player.app.expectRenderedHandMatchesServer();
      await player.app.expectTurnMatchesServer();
      await expect(player.app.opponents).toHaveCount(count - 1);
    }
    expect((await players[0].context.storageState()).origins[0].localStorage.find(item => item.name === 'gdy_token')?.value)
      .not.toBe((await players[1].context.storageState()).origins[0].localStorage.find(item => item.name === 'gdy_token')?.value);
  });
}

test('accepted play decrements exactly one hand, shows the card to peers and all-pass resets the trick @key-flow', async ({ createPlayers }) => {
  const players = await createPlayers(3);
  await startHumanRoom(players);
  const leader = players.find(player => player.app.wire.playerId === player.app.wire.game.view.currentPlayerId)!;
  const leaderId = leader.app.wire.playerId;
  const afterPlay = await leader.app.playCards(['S-4']);
  expect(afterPlay.view.revision).toBe(1);
  expect(afterPlay.view.selfHand).toHaveLength(17);
  expect(afterPlay.view.selfHand).not.toContain('S-4');
  for (const player of players) {
    await player.app.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision === 1);
    await expect(player.app.page.locator('#table-mid .table-cards [data-id="S-4"]')).toBeVisible();
    await player.app.expectTurnMatchesServer();
    if (player !== leader) {
      const seat = player.app.wire.game.view.players.findIndex(value => value.id === leaderId);
      await expect(player.app.page.locator(`.opp[data-seat="${seat}"] .card-count-ring`)).toHaveText('17');
    }
  }
  const firstPasser = players.find(player => player.app.wire.playerId === afterPlay.view.currentPlayerId)!;
  const afterPass = await firstPasser.app.passTurn();
  expect(afterPass.view.passedSinceLastPlay).toEqual([firstPasser.app.wire.playerId]);
  const secondPasser = players.find(player => player.app.wire.playerId === afterPass.view.currentPlayerId)!;
  await secondPasser.app.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision === 2);
  await secondPasser.app.passTurn();
  for (const player of players) {
    const reset = await player.app.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision === 3);
    expect(reset.view.lastPlay).toBeNull();
    expect(reset.view.passedSinceLastPlay).toEqual([]);
    expect(reset.view.currentPlayerId).toBe(leaderId);
    await expect(player.app.page.locator('#table-mid .table-cards')).toHaveCount(0);
  }
  await expect(leader.app.pass).toBeDisabled();
  await expect(leader.app.page.locator('#my-lastplay')).toContainText('Your lead');
});

test('full room rejects a fourth player and guests have no Start control', async ({ createPlayers }) => {
  const players = await createPlayers(4);
  const code = await players[0].app.createRoom('QA Host');
  await players[1].app.joinRoom(code.toLowerCase(), 'QA One', true);
  await players[2].app.joinRoom(code, 'QA Two');
  await expect(players[1].app.page.locator('#btn-start')).toBeHidden();
  const outsider = players[3].app;
  await outsider.page.locator('#inp-name').fill('QA Outsider');
  await outsider.page.locator('#inp-code').fill(code);
  await outsider.page.locator('#btn-join').click();
  await outsider.wire.waitFor('ERROR', frame => frame.code === 'ROOM_FULL');
  await expect(outsider.toast.last()).toHaveText('Room is full.');
  await expect(outsider.home).toBeVisible();
  expect(players[0].app.wire.room.seats.filter(seat => seat.name === 'QA Outsider')).toEqual([]);
});

test('quick chat reaches a peer as visible text without mutating the game', async ({ createPlayers }) => {
  const players = await createPlayers(3);
  await startHumanRoom(players);
  const sender = players[0].app;
  const revision = sender.wire.game.view.revision;
  await sender.page.locator('#btn-chat').click();
  const phrase = sender.page.locator('#chat-pop [data-chat="0"]');
  const text = (await phrase.innerText()).trim();
  await phrase.click();
  for (const player of players) {
    await player.app.wire.waitFor('CHAT_MSG', frame => frame.text === text && frame.from === sender.wire.playerId);
    await expect(player.app.page.locator('.bubble').filter({ hasText: text })).toBeVisible();
    expect(player.app.wire.game.view.revision).toBe(revision);
  }
  await expect(sender.page.locator('#chat-pop')).toBeHidden();
});

test('complete a real hand, verify settlement rows and start a winner-led rematch @key-flow', async ({ createPlayers }, testInfo) => {
  // WebKit needs a larger budget for a full 170-action hand (see config).
  test.setTimeout(testInfo.project.name.includes('webkit') ? 240_000 : 120_000);
  const players = await createPlayers(3);
  await startHumanRoom(players);
  const host = players[0].app;
  let revision = 0;
  // Every accepted play removes at least one card; each trick permits at most
  // two passes. 170 is a diagnostic safety bound, not a sleep or a fake result.
  for (let action = 0; action < 170; action++) {
    await host.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision >= revision);
    if (host.wire.game.view.status === 'FINISHED') break;
    const current = host.wire.game.view.currentPlayerId;
    const active = players.find(player => player.app.wire.playerId === current)!.app;
    await active.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision === revision);
    await expect(active.page.locator('#turn-countdown')).toBeVisible();
    const beforeCards = active.wire.game.view.selfHand.length;
    if (await active.hint.isVisible()) {
      await active.hint.click();
      const selected = await active.hand.locator('.sel').count();
      expect(selected).toBeGreaterThan(0);
      await expect(active.play).not.toHaveAttribute('data-invalid', '1');
      await active.play.click();
      const accepted = await active.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision > revision);
      expect(accepted.view.selfHand).toHaveLength(beforeCards - selected);
      revision = accepted.view.revision;
    } else {
      const accepted = await active.passTurn();
      expect(accepted.view.selfHand).toHaveLength(beforeCards);
      revision = accepted.view.revision;
    }
  }
  const final = await host.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.status === 'FINISHED');
  expect(final.view.finishOrder).toHaveLength(3);
  expect(new Set(final.view.finishOrder).size).toBe(3);
  expect(final.view.currentPlayerId).toBeNull();
  for (const player of players) {
    await player.app.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.status === 'FINISHED');
    await expect(player.app.page.locator('#settle-overlay')).toBeVisible();
    await expect(player.app.page.locator('.settle-row')).toHaveCount(3);
    expect(player.app.wire.game.scores).toEqual(final.scores);
    const orderedNames = final.view.finishOrder.map(id => player.app.wire.room.seats.find(seat => seat.playerId === id)!.name);
    const rows = player.app.page.locator('.settle-row');
    for (let place = 0; place < 3; place++) {
      await expect(rows.nth(place)).toContainText(orderedNames[place]);
      await expect(rows.nth(place).locator('.total')).toHaveText(`${final.scores[final.view.finishOrder[place]]} pts`);
    }
  }
  await host.page.locator('#btn-again').click();
  for (const player of players) {
    const next = await player.app.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.handNumber === 2 && frame.view.status === 'PLAYING');
    expect(next.view.currentPlayerId).toBe(final.view.finishOrder[0]);
    expect(next.view.revision).toBe(0);
    expect(next.view.gameId).not.toBe(final.view.gameId);
    expect(next.scores).toEqual(final.scores);
    await expect(player.app.page.locator('#settle-overlay')).toBeHidden();
    await expect(player.app.cards).toHaveCount(18);
  }
});

test('two guests racing for the last seat produce exactly one join and one ROOM_FULL', async ({ createPlayers }) => {
  const players = await createPlayers(4);
  const host = players[0].app;
  const code = await host.createRoom('QA Host');
  await players[1].app.joinRoom(code, 'QA Seated');
  const racers = [players[2].app, players[3].app];
  for (let i = 0; i < racers.length; i++) {
    await racers[i].page.locator('#inp-name').fill(`QA Racer ${i}`);
    await racers[i].page.locator('#inp-code').fill(code);
  }
  await Promise.all(racers.map(racer => racer.page.locator('#btn-join').click()));
  await expect.poll(() => racers.every(racer => racer.wire.received.some(frame => frame.type === 'ROOM_STATE' || frame.type === 'ERROR')), {
    message: 'Both real concurrent join requests receive a terminal response',
  }).toBe(true);
  const winners = racers.filter(racer => racer.wire.received.some(frame => frame.type === 'ROOM_STATE'));
  const losers = racers.filter(racer => racer.wire.received.some(frame => frame.type === 'ERROR' && frame.code === 'ROOM_FULL'));
  expect(winners).toHaveLength(1);
  expect(losers).toHaveLength(1);
  await expect(winners[0].roomScreen).toBeVisible();
  await expect(losers[0].home).toBeVisible();
  await expect(losers[0].toast.last()).toHaveText('Room is full.');
  await expect.poll(() => host.wire.room.seats.filter(seat => !seat.playerId.startsWith('empty:')).length).toBe(3);
  expect(new Set(host.wire.room.seats.map(seat => seat.playerId)).size).toBe(3);
});
