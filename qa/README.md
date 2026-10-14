# Gandengyan Playwright QA pack

A repository-integrated TypeScript suite for `erpan219/gandengyan-online`, inspected at commit **aff6d613ee3fa47700ccc25431b2d279b019aaf5**. It exercises the real shared rules, server match layer and shipped vanilla frontend. It does not replace the application with a mock or install a test endpoint in production.

## Install

Copy the entire `qa/` folder into the repository root, next to `shared/`, `server/`, and `client/`. Copy `qa/.github/workflows/gandengyan-qa.yml` to the repository's `.github/workflows/` if you want CI. Do not overwrite an existing workflow without reviewing it.

```bash
# Repository root — build the actual server. Root currently has no committed lockfile.
npm install --ignore-scripts
npm run build
# Keep the tracked client/dist. The React client/src build is a different frontend.
cd qa
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run typecheck
npm run test:engine
npm run test:chromium
npm run test:browsers
npm run test:devices
npm run report
```

Node22 LTS is recommended; QA dependency versions and lockfile are pinned. The app's own dependency resolution follows its package manifests. Review future app dependency changes independently.

## Tiered test gate (added Oct 2026 — the full matrix is ~2h, so match the gate to the change)

Pick the tier by blast radius, not by habit. A full 6-project matrix for a test-only change wastes ~2h and, worse, a VM replacement mid-run costs the whole run again. Keep every local run under ~30 min — split by project when a full run is needed.

| Tier | When | Local gate | Approx. time |
|---|---|---|---|
| **1 — Small** | One spec file, test-only change, or a small CSS/i18n tweak | `npm run typecheck` + `npm run test:engine` + the affected spec file(s) on **every** project, e.g. `npm run test:webkit-desktop -- tests/table-transitions.spec.ts` | 5–15 min |
| **2 — Medium** | Client logic, `ui.js`/`ui-render.js`/`game.js`, a fixture used by many tests, or several spec files | `npm run typecheck` + `npm run test:engine` + full `npm run test:chromium` + the affected spec files on every other project | 30–45 min |
| **3 — Major** | Game engine, protocol, server, shared code, rules, or anything touching game correctness | Full matrix: `npm run test:engine` + `npm run test:browsers` + `npm run test:devices` (or all six `test:<project>` scripts) | ~2h |

Rules:
- **Tier 1/2 rely on CI as the full-matrix backstop.** CI runs all 7 jobs in parallel (~14 min). Push after the targeted local gate passes, then confirm CI is green. Do not skip the targeted local gate — it is what prevents a push from spamming failure emails.
- **Tier 3 runs the full local matrix before pushing**, same as before.
- **Never invent a skip to make a run green.** An unexpected failure is investigated (trace/video + root cause) before any push — the standing "investigate before pushing" rule applies at every tier.
- **Logs for long runs go under `~/workspace/`, not `/tmp`** — `/tmp` is wiped on VM replacement, along with the run itself.
- **One worker is intentional** (see Safety and isolation): the fixture binds port 3000 and the server rate-limits room creation to 5/min/IP. Do not parallelize with `workers > 1` without first giving each worker its own port and accounting for the limiter — otherwise tests collide and flake.

## Safety and isolation

Browser tests start a fresh actual local server for every test on `http://localhost:3000`. Stop your development server first. An occupied port fails safely: this pack will not kill or reuse an unknown process. One worker is intentional, because the server's allowed-origin list is fixed and its room-creation limiter is five rooms per minute per IP. Restarting a disposable server isolates state without bypassing production protections.

External BASE_URL overrides are rejected. Do not retarget this suite to the live site: multiplayer cases create rooms, start hands and intentionally disconnect clients. All nicknames are synthetic. Test code neither pushes, deploys, nor changes the real repository. CI runs on disposable runners.

## Architecture

- `pages/`: real DOM selectors, Lobby and GameTable interactions; no text guessed from old React source.
- `fixtures/server.ts`: isolated actual Node server, readiness and bounded process teardown.
- `fixtures/browser.ts`: independent player contexts, bot room setup and local fault injection.
- `helpers/`: typed protocol observation and deterministic engine helpers.
- `data/rule-cases.ts`: independently stated positive/negative combination oracles.
- `tests/game-rules.spec.ts`, `scoring.spec.ts`: actual application engine/match imports; no browser required.
- Other specs: lobby, multiplayer, reconnect, i18n, UI and accessibility contracts.
- `docs/MANUAL_TEST_PLAN.md`: prioritized manual coverage, real-device matrix and performance notes.
- `docs/VALIDATION.md`: exact checks run for this delivery, failures and limitations.

## Determinism, debugging and evidence

Pure engine cases use explicit decks, states and expected outcomes. Every browser context uses a fixed client-side Math.random value, affecting all client code and providing a repeatable practice deal. The server keeps its real RNG. Dedicated pure-engine tests use explicit seeded RNGs. Multiplayer cases observe real WebSocket snapshots, not fabricated server responses. All clients use separate contexts so local storage and reconnect tokens do not leak between players. A multi-context test is multiple players within the configured browser engine; it is not a simultaneous Chrome-versus-Safari session.

No sleeps are used to guess that an animation finished. Tests wait for UI or protocol state; actual server grace periods remain real time. Timeouts are bounded. Screenshots are captured on failure, traces retained on failure and key multiplayer flows preserve videos. Reports may contain synthetic room/session data; do not publish raw traces from personal accounts.

Default projects include Chromium, Firefox, WebKit, Android-like Chromium, iPhone-like WebKit and iPad-like WebKit. Emulation provides viewport/touch/user-agent coverage, not proof of hardware, iOS or native Safari support.

`@known-issue` is reserved for strict desired-behavior regressions that are documented against this source baseline; default runs and CI include those tests and remain red while these confirmed defects persist. `npm run test:baseline` explicitly excludes the tag for a narrower regression run; it is not a complete acceptance pass. `npm run test:acceptance` includes everything. Never turn a new unexpected failure into a skip to make CI green. Check the validation document for whether any such cases exist.

## Rule differences to keep explicit

Room codes are six alphanumeric characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, not six decimal digits. Jokers are not wildcards. They are high single cards and together form a rocket. The user shorthand “wilds except the two jokers” is not implemented as substitution. Normal sequences exclude 2, 3 and jokers. First place does not immediately stop the hand: other players continue for ranking. Crazy mode rebuilds a fresh deck and performs 8–12 swaps each hand; it does not reuse capture packets or guarantee any player a bomb. The base-score selector is read by the UI, but the inspected solo scoring ignores it and the online protocol has no base multiplier. Tests document this contract rather than inventing multiplied expected scores.

## Limits and maintaining the pack

This is an executable QA baseline, not a certification of every device or security property. The manual plan covers tests that may not be automated. Review selectors and protocol contracts when upgrading the app. Do not run `build:client` merely to prepare this pack: the served application currently lives in tracked `client/dist` and differs from the React source. No production files were changed by generating this deliverable.
