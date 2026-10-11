import type { BrowserContext, BrowserContextOptions } from '@playwright/test';
import { serverTest, expect } from './server';
import { GandengyanPage } from '../pages/GandengyanPage';

export interface BrowserPlayer {
  context: BrowserContext;
  app: GandengyanPage;
  /** Replace a closed tab without replacing its browser storage/session. */
  reopen(): Promise<GandengyanPage>;
}

type BrowserFixtures = {
  app: GandengyanPage;
  createPlayers: (count: number) => Promise<BrowserPlayer[]>;
  _localOnly: void;
};

async function prepareContext(context: BrowserContext): Promise<void> {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) await route.continue();
    else await route.abort('blockedbyclient');
  });
  await context.addInitScript(() => {
    // This affects practice-mode shuffling only; the server retains real RNG.
    // Fixed upper-bound random => identity Fisher-Yates => S-4 starts in seat 0.
    Math.random = () => 0.999999999;
    if (!localStorage.getItem('ddz_lang')) localStorage.setItem('ddz_lang', 'en');
    const NativeWebSocket = window.WebSocket;
    const sockets: WebSocket[] = [];
    Object.defineProperty(window, '__qaSockets', { value: sockets });
    class LocalWebSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const parsed = new URL(String(url), location.href);
        if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('QA forbids non-local WebSocket connections');
        super(url, protocols);
        sockets.push(this);
      }
    }
    window.WebSocket = LocalWebSocket;
  });
}

export const test = serverTest.extend<BrowserFixtures>({
  _localOnly: [async ({ context }, use) => { await prepareContext(context); await use(); }, { auto: true }],
  app: async ({ page, appServer, _localOnly }, use, testInfo) => {
    const app = new GandengyanPage(page, appServer);
    await app.open();
    await use(app);
    if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach('browser-protocol', { body: app.wire.diagnostic(), contentType: 'application/json' });
  },
  createPlayers: async ({ browser, appServer, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, locale, colorScheme, contextOptions }, use, testInfo) => {
    const all: BrowserPlayer[] = [];
    const observed: GandengyanPage[] = [];
    await use(async count => {
      if (count < 1 || count > 5) throw new Error('A fixture supports 1–5 independent local players');
      const players: BrowserPlayer[] = [];
      for (let i = 0; i < count; i++) {
        const options: BrowserContextOptions = {
          ...contextOptions, baseURL: appServer, viewport, isMobile, hasTouch,
          deviceScaleFactor, userAgent, locale, colorScheme,
          // CDP screencast video is ~37% overhead even in Chromium and far worse
          // under WebKit software rendering (full CPU composite per frame); it
          // pushed the full-hand test past its CI budget. Screenshots + protocol
          // attachments still cover WebKit failure diagnostics.
          ...(testInfo.project.name.includes('webkit')
            ? {}
            : { recordVideo: { dir: testInfo.outputPath(`player-${all.length + 1}-video`) } }),
        };
        const context = await browser.newContext(options);
        await prepareContext(context);
        const app = new GandengyanPage(await context.newPage(), appServer);
        await app.open();
        observed.push(app);
        const player: BrowserPlayer = {
          context, app,
          async reopen() {
            const replacement = new GandengyanPage(await context.newPage(), appServer);
            observed.push(replacement);
            await replacement.open();
            player.app = replacement;
            return replacement;
          },
        };
        all.push(player);
        players.push(player);
      }
      return players;
    });
    const failed = testInfo.status !== testInfo.expectedStatus;
    const preserveVideo = failed || testInfo.title.includes('@key-flow');
    for (const [i, app] of observed.entries()) {
      if (preserveVideo) {
        await testInfo.attach(`player-${i + 1}-protocol`, { body: app.wire.diagnostic(), contentType: 'application/json' });
        if (!app.page.isClosed()) await testInfo.attach(`player-${i + 1}-screen`, { body: await app.page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
    }
    for (const [i, player] of all.entries()) {
      // Playwright Test automatically traces every browser.newContext() here;
      // a second tracing.start() would fail with 'already started'.
      const videos = observed.filter(app => app.page.context() === player.context).map(app => app.page.video()).filter(video => video !== null);
      await player.context.close();
      for (const [j, video] of videos.entries()) {
        if (preserveVideo) await testInfo.attach(`player-${i + 1}-${j + 1}-video`, { path: await video.path(), contentType: 'video/webm' });
        else await video.delete();
      }
    }
  },
});
export { expect };

/** Each participant is an isolated browser context in the current project engine.
 * Browser-matrix coverage does not claim mixed Chromium/Firefox/WebKit rooms. */
export async function startHumanRoom(players: BrowserPlayer[], count: 3 | 4 = 3): Promise<string> {
  const code = await players[0].app.createRoom('QA Host', count);
  for (let i = 1; i < players.length; i++) await players[i].app.joinRoom(code, `QA Guest ${i}`);
  await expect.poll(() => players[0].app.wire.room.seats.filter(seat => !seat.playerId.startsWith('empty:')).length).toBe(players.length);
  await players[0].app.startGame();
  for (const player of players) {
    await player.app.wire.waitFor('GAME_STATE');
    await expect(player.app.gameScreen).toBeVisible();
  }
  return code;
}

/** Real room with one human and server-managed AI seats; no simulated bot frames. */
export async function startBotRoom(app: GandengyanPage, count: 3 | 4 = 3): Promise<string> {
  const code = await app.createRoom('QA Human', count);
  const initial = await app.startGame();
  expect(initial.botIds).toHaveLength(count - 1);
  await expect(app.page.locator('#turn-countdown')).toBeVisible({ timeout: 8_000 });
  return code;
}
