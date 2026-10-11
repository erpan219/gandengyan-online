import { test, expect, startHumanRoom } from '../fixtures/browser';
import type { GameFrame, RoomFrame, WelcomeFrame } from '../helpers/browser-protocol';

test('unexpected transport close automatically reconnects the same identity and unchanged hand', async ({ createPlayers }) => {
  const players = await createPlayers(3);
  await startHumanRoom(players);
  const target = players[1].app;
  const before = target.wire.game;
  const mark = target.wire.received.length;
  await target.closeTransport();
  await target.wire.waitFor<WelcomeFrame>('WELCOME', frame => frame.playerId === before.view.selfId, { after: mark, timeout: 10_000 });
  const recovered = await target.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.gameId === before.view.gameId, { after: mark });
  expect(recovered.view.selfId).toBe(before.view.selfId);
  expect(recovered.view.selfHand).toEqual(before.view.selfHand);
  expect(recovered.view.revision).toBe(before.view.revision);
  expect(target.wire.connections).toBeGreaterThanOrEqual(2);
  await expect(target.gameScreen).toBeVisible();
  await target.expectRenderedHandMatchesServer();
  expect(target.wire.room.seats.filter(seat => seat.playerId === before.view.selfId)).toHaveLength(1);
  expect(target.wire.room.seats.find(seat => seat.playerId === before.view.selfId)?.isBot).toBe(false);
});

test('30-second disconnect grace causes real AI takeover, then token reconnect reclaims that seat @key-flow', async ({ createPlayers }) => {
  test.setTimeout(75_000);
  const players = await createPlayers(3);
  const code = await startHumanRoom(players);
  const departed = players.find(player => player.app.wire.playerId === player.app.wire.game.view.currentPlayerId)!;
  const observers = players.filter(player => player !== departed);
  const observer = observers[0].app;
  const playerId = departed.app.wire.playerId;
  const gameId = departed.app.wire.game.view.gameId;
  const marker = observer.wire.received.length;
  // Closing the tab also prevents the client's reconnect timer; server time is
  // genuine. No clock manipulation or shortened production grace period.
  await departed.app.page.close();
  await observer.wire.waitFor<RoomFrame>('ROOM_STATE', frame => frame.seats.some(seat => seat.playerId === playerId && !seat.connected), { after: marker });
  const takeover = await observer.wire.waitFor<RoomFrame>('ROOM_STATE', frame => frame.seats.some(seat => seat.playerId === playerId && seat.isBot), { after: marker, timeout: 42_000 });
  expect(takeover.seats.find(seat => seat.playerId === playerId)?.name).toMatch(/ \(AI\)$/);
  // At 30s the existing human-turn timeout may run immediately before takeover.
  // Pass the two remaining human turns to put the taken-over seat on lead.
  for (let i = 0; i < 2; i++) {
    const active = observer.wire.game.view.currentPlayerId;
    const human = observers.find(player => player.app.wire.playerId === active);
    expect(human, 'Current player after the initial timeout is an observed human').toBeTruthy();
    await human!.app.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.currentPlayerId === active && frame.view.revision === observer.wire.game.view.revision);
    await human!.app.passTurn();
    await observer.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision >= human!.app.wire.game.view.revision);
  }
  const botTurnRevision = observer.wire.game.view.revision;
  const aiMove = await observer.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.revision > botTurnRevision && frame.view.lastPlay?.playerId === playerId, { timeout: 5_000 });
  expect(aiMove.botIds).toContain(playerId);
  expect(aiMove.view.lastPlay!.combination.cardCount).toBeGreaterThan(0);
  const rejoined = await departed.reopen();
  await rejoined.joinRoom(code, 'QA Reclaimed');
  const recovered = await rejoined.wire.waitFor<GameFrame>('GAME_STATE', frame => frame.view.selfId === playerId && frame.view.gameId === gameId);
  expect(recovered.botIds).not.toContain(playerId);
  await observer.wire.waitFor<RoomFrame>('ROOM_STATE', frame => frame.seats.some(seat => seat.playerId === playerId && !seat.isBot && seat.connected), { after: marker });
  await rejoined.expectRenderedHandMatchesServer();
  expect(rejoined.wire.room.seats.filter(seat => seat.playerId === playerId)).toHaveLength(1);
});

test('leaving a lobby transfers host and permits another guest to use the freed seat', async ({ createPlayers }) => {
  const players = await createPlayers(3);
  const code = await players[0].app.createRoom('QA Host');
  await players[1].app.joinRoom(code, 'QA Next Host');
  const marker = players[1].app.wire.received.length;
  await players[0].app.page.locator('#btn-leave-room').click();
  await expect(players[0].app.home).toBeVisible();
  await players[1].app.wire.waitFor<RoomFrame>('ROOM_STATE', frame => frame.hostId === players[1].app.wire.playerId, { after: marker });
  await expect(players[1].app.page.locator('#btn-start')).toBeVisible();
  await players[2].app.joinRoom(code, 'QA Replace');
  await expect(players[1].app.page.locator('#room-players')).toContainText('QA Replace');
  expect(players[1].app.wire.room.seats.some(seat => seat.name === 'QA Host')).toBe(false);
});
