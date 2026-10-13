import { defineConfig, devices } from '@playwright/test';
const browserFiles = /(?:lobby|multiplayer|reconnect|i18n|accessibility|ui|table-transitions|settle-flow)\.spec\.ts/;
// WebKit (software rendering in CI) is markedly slower than Chromium/Firefox,
// and the full-hand multiplayer test performs up to 170 UI actions against a
// re-rendering game view. These budgets cover that slowness; they do not
// weaken any assertion.
const webkitUse = { actionTimeout: 30_000 };
const WEBKIT_TIMEOUT = 300_000;
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1,
  timeout: 60_000, expect: { timeout: 10_000 }, retries: 0,
  forbidOnly: !!process.env.CI,
  grepInvert: process.env.EXCLUDE_KNOWN_ISSUES === '1' ? /@known-issue/ : undefined,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: { baseURL: 'http://localhost:3000', screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'retain-on-failure', actionTimeout: 10_000 },
  projects: [
    { name: 'engine', testMatch: /(?:game-rules|scoring|protocol|shared-deck|shared-classify|shared-engine)\.spec\.ts/ }, // non-browser tests: rules, scoring, raw-protocol, shared-source goldens
    { name: 'chromium-desktop', testMatch: browserFiles, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox-desktop', testMatch: browserFiles, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-desktop', testMatch: browserFiles, timeout: WEBKIT_TIMEOUT, use: { ...devices['Desktop Safari'], ...webkitUse } },
    { name: 'mobile-chromium', testMatch: browserFiles, use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', testMatch: browserFiles, timeout: WEBKIT_TIMEOUT, use: { ...devices['iPhone 13'], ...webkitUse } },
    { name: 'tablet-webkit', testMatch: browserFiles, timeout: WEBKIT_TIMEOUT, use: { ...devices['iPad Pro 11'], ...webkitUse } },
  ],
});
