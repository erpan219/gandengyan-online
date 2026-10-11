# Validation report

**Application source:** `aff6d613ee3fa47700ccc25431b2d279b019aaf5` from https://github.com/erpan219/gandengyan-online. **Date:** 11 October 2026 UTC. Tests executed in a disposable Linux cloud workspace against a local server and the tracked `client/dist`. No public rooms, real players, deployments, commits or production edits.

## Verified checks

| Layer | Result |
|---|---|
| Actual application server build | Passed `npm run build` |
| QA TypeScript check | Passed `npm run typecheck` with strict checking |
| Shared engine, real Match scoring and shipped browser-engine parity | 742 passed, 0 failed/skipped/flaky; 12.8s final run |
| Chromium 141.0.7390.37 desktop baseline | 27 passed, 0 failed/skipped/flaky; 166.7s |
| Chromium affected AI cases after final condition-wait refinement | 3 passed; no assertion weakened |
| Chromium strict desired-behavior acceptance checks | 3 failed, each a reproduced application issue listed below |
| Firefox 142.0.1 desktop baseline | 27 passed, 0 failed/skipped/flaky; 199.8s |
| Android-like Chromium emulation | 27 passed, 0 failed/skipped/flaky; 232.2s |
| WebKit desktop / iPhone / iPad projects | Authored and typechecked; execution blocked by missing cloud host libraries |
| Physical devices / native Safari / screen readers | Not run |

Final per-project results are intentionally separated. A narrower passing baseline is not a clean acceptance result. The default suite and supplied CI include known-issue tests, so current application behavior produces a failing status until fixed. `npm run test:baseline` is an explicit opt-in to exclude that tag. No `test.skip`, `test.fail`, blanket retries or fake responses were used to conceal failures.

## Reproduced acceptance defects

### QA-LOBBY-001 — failed Join leaves the button disabled

- Open the local home screen, enter an unknown six-character code (`ZZZZZZ`) and click Join.
- Wait for the actual `ROOM_NOT_FOUND` WebSocket error and visible error toast.
- **Actual:** Join remains disabled, preventing correction/retry without another recovery action.
- **Expected:** the pending state clears after the terminal error so the player can correct the code and retry.
- Strict assertion: `tests/lobby.spec.ts`, `failed join re-enables Join for correction @known-issue`.

### QA-A11Y-001 — nickname input lacks an accessible name

- Inspect the nickname field's computed accessible name on the local homepage.
- **Actual:** empty accessible name despite a visible label.
- **Expected:** a programmatic label, such as an associated `label[for]` or equivalent accessible naming.
- Strict assertion: `tests/accessibility.spec.ts`, `home nickname and room-code inputs have programmatic labels @known-issue`. The first nickname assertion fails; do not treat the later room-code assertion as independently runtime verified.

### QA-A11Y-002 — rules dialog lacks an accessible title

- Open How to play and inspect the visible dialog's computed accessible name.
- **Actual:** empty name; `role=dialog` and `aria-modal` alone do not name it.
- **Expected:** the visible title names the dialog through `aria-labelledby` or an equivalent localized name.
- Strict assertion: `tests/accessibility.spec.ts`, `help dialog has a programmatic accessible title @known-issue`.

These are application failures, separate from implementation issues corrected during test development. Earlier fixture faults (duplicate tracing startup, an overlong synthetic nickname, and an immediate DOM timing check) were corrected and rerun; they are not reported as product defects.

## Environment limitations

Firefox initially failed to launch because its cloud profile/font cache was not writable; a temporary writable HOME and XDG cache resolved launch without changing the application. WebKit requires `libgtk-4`, `libgraphene`, `libwoff2dec`, `libharfbuzz-icu`, `libhyphen`, `libmanette` and `libGLESv2` in this environment. The supplied CI installs Playwright's official browser dependencies. A configured project is not evidence of execution.

Browser device profiles emulate viewport, input and user-agent characteristics. They do not validate a physical Android device, iPhone, iPad or native Safari. The performance plan defines measurements and proposed budgets; no load or Core Web Vitals benchmark is claimed. See `COVERAGE.md` for remaining manual scenarios and source-summary differences.

## Reproduction

```bash
cd qa
npm run typecheck
npm run test:engine
npm run test:baseline -- --project=chromium-desktop
npm run test:baseline -- --project=firefox-desktop
npm run test:baseline -- --project=mobile-chromium
# Include the strict failures; current baseline is expected to be red.
npm run test:acceptance -- --project=chromium-desktop --grep @known-issue
```

Screenshots, traces, protocol diagnostics and key-flow videos are produced by the configured reporters/fixtures. The source pack excludes temporary runner output and session traces; running the pack generates fresh evidence for the user's build.

## 2026-10-11 UTC re-validation — three acceptance defects fixed

**Application source:** `f35ce8eab45b373670e786083c57438ad91e6e71` from https://github.com/erpan219/gandengyan-online. Verified in a disposable Linux workspace against a local server and the tracked `client/dist`.

| Layer | Result |
|---|---|
| QA TypeScript check | Passed `npm run typecheck` |
| Shared engine, real Match scoring and shipped browser-engine parity | 742 passed, 0 failed; 13.7s |
| Chromium 141.0.7390.37 desktop — full suite (baseline + formerly failing) | 30 passed, 0 failed/skipped/flaky |
| Focused rerun of the three formerly failing strict assertions | 3 passed |

- QA-LOBBY-001 (failed Join re-enables for correction): fixed — terminal join errors (`ROOM_NOT_FOUND`/`ROOM_FULL`/`SERVER_ERROR`) and connect failures clear the pending-join state.
- QA-A11Y-001 (nickname/room-code programmatic labels): fixed — `for` associations added.
- QA-A11Y-002 (help dialog accessible title): fixed — `aria-labelledby="t-help-title"` added.

The three tests are kept as regression tests; their obsolete `@known-issue` tag was removed on this date. The sections above describing the original failures are retained as history.
