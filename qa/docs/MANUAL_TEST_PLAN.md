# Gandengyan: Risk-Based Manual Test Plan

## Scope and baseline

- **Source baseline:** `aff6d613ee3fa47700ccc25431b2d279b019aaf5` (11 October 2026 UTC).
- **Application under test:** the tracked vanilla frontend in `client/dist`, served by the Node server. The React implementation in `client/src` is separate and is not the served UI.
- **Execution status:** this document defines planned coverage. It does not establish that any scenario has been executed or passed. Record results separately against the exact build under test.
- **Historical evidence:** prior reports are references only. Reproduce findings against the current test build before carrying them forward.

## Execution contract

1. Run state-changing scenarios only on a disposable local or staging deployment, never on public production. Use isolated browser profiles and invented QA nicknames. Do not interact with real players.
2. Apply these test priorities independently of defect severity:
   - **P0:** release-blocking checks for ownership, legal play, full-deck conservation, single scoring of each event, and recoverable match state.
   - **P1:** core player journeys and essential game behavior.
   - **P2:** usability, resilience, accessibility, and compatibility.
   - **P3:** visual and audio polish.
3. For every execution, record the commit/build, UTC timestamp, browser and version, operating system, viewport, device pixel ratio (DPR), locale, mode, player count, room code, and reproducible seed where available. Redact reconnect tokens. Attach before-and-after screenshots and a trace for failures; redact private values in evidence.
4. Cover three-player and four-player games, Chinese (CN) and English (EN), and normal and crazy modes. Record each tested combination separately rather than treating one combination as proof of all variants.
5. Use current Chrome, Firefox, and Safari on desktop, Android Chrome on a physical phone, Safari on a real iPhone, and an iPad or comparable tablet. Include portrait and landscape orientations. Playwright WebKit and device emulation do not establish real Safari or iOS compatibility.
6. Use these standard viewport sizes: desktop 1440 × 900, laptop 1280 × 720, phone 390 × 844 and 360 × 800, and tablet 768 × 1024 and 1024 × 768. Also check 320 px width, 200% browser zoom, enlarged text, and reduced motion. A resized desktop window does not replace physical-device validation.

## Rule oracle and ambiguity resolution

These are the expected rules to verify. If the product requirements, served frontend, and server disagree, record the discrepancy rather than silently changing the oracle to match the implementation.

- **Rank order, lowest to highest:** 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2, 3, small joker, big joker. Each joker is a high single; the two different jokers together form a rocket. Jokers are **not wildcards** and cannot substitute for cards in straights or pairs.
- **Straights:** unique consecutive ranks from 4 through A only. The minimum is four cards in a three-player game and three cards in a four-player game. Consecutive pairs require at least two adjacent pairs, using ranks 4 through A only. Neither type may wrap or contain 2, 3, or jokers.
- **Bombs and responses:** a triple bomb or quad bomb contains cards of one ordinary rank. A rocket beats a quad, a quad beats a triple, and bombs beat normal combinations. Within a bomb tier, the higher rank wins. A normal response must have the same type and card count as the target and a strictly higher primary rank.
- **Deal and lead:** all 54 cards are dealt. Each player receives 18 cards in a three-player game; sorted hand sizes are 13, 13, 14, and 14 in a four-player game. The initial holder of the four of spades (`S-4`) leads but may play a different card. The previous first-place finisher leads the next hand. The engine advances through seat order; visually confirm that play proceeds counterclockwise.
- **Finishing and scoring:** the first player to empty their hand takes first place, but play continues until only one player remains. Placement points are 2/1/0 for three players and 3/2/1/0 for four players. Each successful triple or quad bomb adds one point; a rocket adds two. Cumulative totals persist across hands. At this source baseline, the base-score selector does not multiply points in either solo or online play; see the source findings below and reproduce the visible behavior separately in each mode.


### Source findings that constrain the oracle

These are static source observations, not runtime test results. Paths are relative to the repository root.

| Topic | Observed implementation | Source reference |
|---|---|---|
| Crazy mode | Both implementations recreate the deck on every hand, then use 8–12 random swaps when `noShuffle` is enabled. There is no capture-packet reuse. | `server/src/match.ts`: `dealNewHand`; `shared/deck.ts`: `createDeck`, `barelyShuffle`; `client/dist/js/game.js`: `startRound`; `client/dist/js/gdy-engine.js`: `gdyBarelyShuffle`. |
| Dealing | Online deals round-robin, starting at seat zero initially and at the previous winner on later hands. Solo deals contiguous blocks of 18/18/18 or 14/14/13/13; its extra-card seats do not rotate. Compare conservation and counts rather than assuming identical seeded per-seat deals across modes. | `shared/deck.ts`: `dealCards`; `server/src/match.ts`: `dealNewHand`; `client/dist/js/game.js`: `startRound`. |
| Base-score selector | `cfgFromForm` reads 1/2/3 into config. Solo `endRound` uses only placement and bomb bonuses. Online `createRoom` does not send `base`, and the protocol and server scoring have no base multiplier. | `client/dist/js/ui.js`: `cfgFromForm`, `newGame`, `createRoom`; `client/dist/js/game.js`: `endRound`; `server/src/protocol.ts`: `CREATE_ROOM`; `server/src/match.ts`: `calculateScores`. |
| Room codes | The server generates six-character codes using the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. The client trims and uppercases input and checks length; the server lookup is case-insensitive. | `server/src/rooms_manager.ts`: `makeCode`, `getRoom`; `client/dist/js/ui.js`: `joinRoom`. |
| Readiness and AI fill | Humans are automatically ready when added. The served Create flow requests AI fill. To test disabled readiness or no AI fill, use the actual protocol in a disposable test deployment rather than inventing a visible UI control. | `server/src/rooms.ts`: `addHuman`; `client/dist/js/ui.js`: `createRoom`; `server/src/protocol.ts`: `SET_READY`, `CREATE_ROOM`. |


## Lobby and configuration

| ID | Priority | Setup and action | Expected result or verification oracle |
|---|---|---|---|
| L01 | P1 | Enter an empty or whitespace-only nickname; try Create and Solo. | Document the actual fallback or validation. There is no unusable blank identity, crash, or duplicate request. |
| L02 | P2 | Try nickname lengths of 1, 12, 13, and 20 characters, plus Chinese text, emoji, and an HTML-looking string. | The UI limit is enforced consistently. Text is displayed as text without markup execution. Document the server-side boundary. |
| L03 | P1 | Select three players, then four players; exercise Create and Solo. | Seat count and card distribution follow the selected player count. |
| L04 | P1 | Toggle crazy mode on and off; complete two hands in each configuration. | Every hand starts from a fresh 54-card deck. Normal mode uses Fisher–Yates; crazy mode applies 8–12 random swaps, including possible self-swaps, on both the first and later hands. Prior capture packets are not reused. Do not assert a guaranteed bomb or equal-rank distribution. |
| L05 | P1 | Select base scores of 1, 2, and 3 in each mode; score a known fixture. | Reproduce the source-observed limitation: base 1, 2, and 3 produce the same fixed placement-plus-bonus score. Solo stores the setting but does not use it in settlement; the online room payload omits it. Record the ineffective selector as a product discrepancy, not a working multiplier. |
| L06 | P1 | Create a room; copy its code; exercise sharing if present. | The code is six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, not six decimal digits. The copied code is exact; lowercase input is accepted after uppercase normalization. Permission denial has a usable fallback. |
| L07 | P1 | Join a valid room code from an independent browser profile. | Each identity occupies one seat. Both clients agree on the roster and phase. |
| L08 | P1 | Try blank, short, long, unsupported-character, unknown, and expired room codes; separately try a valid code in lowercase. | Invalid or unknown codes produce a clear, bounded error without a dead screen or accidental new room. A valid lowercase code joins the intended room. |
| L09 | P1 | Start a solo game with three players and with four players. | Human and AI seat counts are correct, all cards are dealt, and registration is not required. |
| L10 | P2 | Refresh the lobby, navigate Back, cancel the rules view, and click Create repeatedly. | No duplicate seat or room navigation occurs, and no stale overlay remains. |

## In-game UI and accessibility

| ID | Priority | Action | Expected result or verification oracle |
|---|---|---|---|
| U01 | P0 | Inspect the initial hand and every subsequent update. | The displayed cards match the player's actual owned cards. No cards are duplicated or lost, and opponents' private hands are not exposed during play. Separately document any deliberate end-of-hand reveal, which the solo results view supports. |
| U02 | P1 | Check sorting, including 2, 3, and jokers. | Rank and suit ordering is stable and documented. Re-rendering preserves card identity. |
| U03 | P1 | Select and deselect neighboring cards in dense three-player and four-player hands. | Raised cards do not hide neighboring ranks or suits. Deselecting restores the correct stack order and touch targets. |
| U04 | P1 | Select legal and illegal combinations; request a hint. | Only legal selections for the current turn and target can submit a play. An invalid selection is clearly indicated and cannot mutate the game; the served UI may keep an `aria-disabled` control tappable to explain the error. Hints do not suggest an unplayable type. Bombs are not labeled `SINGLE`. |
| U05 | P0 | Attempt to pass while leading, while following, and out of turn. | A leading pass is prevented. A valid following pass advances the turn. An out-of-turn pass is ignored or rejected without changing state. |
| U06 | P2 | Inspect the timer and chat, if present. | The countdown reflects the authoritative turn. Chat is bounded, rate-limited, and escaped. Do not assume absent features exist. |
| U07 | P1 | Switch CN ↔ EN in the lobby, during a hand, and on the results screen. | The hand, turn, selection, and score remain unchanged. All visible labels are translated, and no stale dialogs remain. |
| U08 | P2 | Toggle sound and music, then refresh. | Preferences and control states behave consistently. Blocked autoplay is handled gracefully. Controls have accessible names and keyboard operation. |
| U09 | P1 | Use Tab, Enter, and Space, plus card-navigation arrow keys if implemented. | Focus is visible. Cards and actions are operable. Modal focus containment, Escape dismissal, and focus return work without a keyboard trap. |
| U10 | P2 | Use VoiceOver or NVDA; repeat relevant checks at 200% zoom. | Card rank, suit, selection, and turn information are announced. Labels and heading structure are meaningful. Check contrast of at least 4.5:1 for normal text and 3:1 for relevant UI components; meaning is not conveyed by color alone. |
| U11 | P2 | Rotate phones and resize tablet layouts during a hand. | There is no horizontal clipping, overlap, or hidden action. Safe areas and browser address-bar changes are accommodated. |

## Game rules, completion, and scoring

| ID | Priority | Action or fixture | Expected result or verification oracle |
|---|---|---|---|
| G01 | P0 | Start a new three-player or four-player hand. | There are 54 unique card IDs, correct hand sizes, and no discarded cards. The `S-4` owner acts first. |
| G02 | P0 | Lead a legal combination that does not contain `S-4` on the first turn. | The lead is accepted; including `S-4` is not mandatory. |
| G03 | P0 | Exercise every classification case in `qa/data/rule-cases.ts`. | Classification matches the independent expected result for each `RULE-*` case. Invalid input causes no game-state mutation. |
| G04 | P0 | Respond to each normal type with equal, lower, and higher combinations, plus wrong-length and wrong-type combinations. | Only a strictly higher response of the same type and count, or a legal bomb, is accepted. Cross-check the applicable `BEAT-*` cases. |
| G05 | P0 | Exercise triple → higher triple → quad → higher quad → rocket. | Bomb tier and rank ordering are strict. No response beats a rocket. |
| G06 | P0 | Have every other active player pass. | The trick clears. The winning active player leads; if that player has finished, the next active player leads. |
| G07 | P0 | Empty one player's hand while at least two other players remain active. | Placement is assigned once, the game continues, and the finished player is skipped. |
| G08 | P0 | With two active players left, empty one player's hand. | The last player's placement is assigned and results appear once. There is no impossible turn or zero-card action. |
| G09 | P0 | Finish a hand with a triple bomb, quad bomb, or rocket. | The bomb bonus is counted even on the finishing play, without a duplicate award. |
| G10 | P0 | Use a known finish order and known bomb counts. | Placement points plus bonuses are exact. Cumulative totals equal previous totals plus the current hand's points. |
| G11 | P1 | Complete three rounds. | The previous winner starts, the hand number advances, scores persist, and all cards are redealt. |
| G12 | P0 | Submit duplicate card IDs, a foreign card, an out-of-turn action, and a stale revision. | Each invalid action is rejected without changing hands, turn, score, or revision. |
| G13 | P1 | Exercise the longest legal bomb chain available in a fixture and a state with few cards remaining. | Card conservation and termination hold, without overflow or a stale last-play state. |
| G14 | P1 | Repeat seeded crazy-mode first and later hands. | Each hand recreates the canonical deck and applies 8–12 random swaps. With a controlled RNG, verify that algorithm separately from dealing. There is no prior-hand capture-packet input. All 54 cards are preserved; online and solo deals need not allocate the same cards to the same seats. |

## Multiplayer, recovery, and concurrency

| ID | Priority | Action | Expected result or verification oracle |
|---|---|---|---|
| M01 | P0 | Join the final available seat concurrently from independent clients. | Exactly one join succeeds; the other receives `ROOM_FULL`. Room capacity is never exceeded. |
| M02 | P1 | Have the host start with and without AI fill; set a human unready through the actual protocol when no UI control exists. | AI fills only empty seats. Without AI fill, an incomplete room is rejected. Ready checks are enforced. |
| M03 | P0 | Rejoin from the same browser or repeat `JOIN_ROOM`. | Seat ownership is idempotent; no human player is duplicated. |
| M04 | P0 | Send `START_GAME` as a non-host, duplicate `PLAY_CARDS`, and use a stale `expectedRevision`. | Unauthorized and stale changes are rejected, and clients converge on authoritative state. |
| M05 | P0 | Briefly lose the network during `PLAYING`, then reconnect. | The same player, reconnect token, and hand are recovered without an extra seat. The replacement socket owns authority. |
| M06 | P1 | Disconnect for more than 30 seconds while playing. | AI takes over after the grace period and can make a move. Reconnecting restores human control. |
| M07 | P1 | Intentionally leave from the lobby, during play, and on results. | Leaving the lobby or results frees the seat. Leaving mid-game preserves the match through takeover. Host transfer is consistent. |
| M08 | P0 | Disconnect on results, then rejoin. | Score and identity are preserved within the 120-second grace period. An expired session produces a clear error. |
| M09 | P1 | After reconnecting, send from the old socket or close it late. | The old socket cannot act for the new connection or detach the current connection. |
| M10 | P1 | Disconnect every human player. | The match does not crash. Cleanup and expiry are bounded. Document reconnect behavior. |
| M11 | P2 | Apply latency or packet loss, then background and restore a tab. | Scores are not duplicated. An authoritative snapshot eventually restores consistency, and stale controls are disabled. |

## Edge and negative checklist

These cross-cutting checks supplement the detailed cases above. Use their IDs in evidence and defect reports.

| ID | Priority | Required coverage | Related cases |
|---|---|---|---|
| N01 | P0 | Reject leading passes, zero-card plays, foreign cards, and duplicate card IDs. | U05, G03, G12 |
| N02 | P0 | Repeated results do not award points twice; finishing bombs receive their bonus. | G08–G10, M04 |
| N03 | P0 | Remaining players finish, and all 54 cards remain accounted for after every transition. Include cards in hands, the current trick, and discard, or use a ledger of accepted plays in solo mode; do not count only cards still held. | G01, G06–G08, G13–G14 |
| N04 | P1 | Quickly double-click Play, Pass, Ready, and Start. | U04–U05, M02–M04 |
| N05 | P1 | Reload while waiting, during dealing, and after finishing; reconnect after an AI action; try missing and expired session tokens. | L10, M05–M09 |
| N06 | P1 | Exercise the maximum legal bomb chain and crazy mode with both three and four players. | L04, G13–G14 |
| N07 | P2 | Deny clipboard access; load initially while offline; test a server cold start and excessive toast notifications. | L06, L08, M11 |
| N08 | P2 | Check long translations, Chinese punctuation, Unicode nicknames, and locale persistence. | L02, U07, U11 |
| N09 | P3 | Review animation polish, icon alignment, sound mix, and consistent spacing. | U03, U08, U11 |

## Performance measurement

These scenarios define measurements to collect, not benchmarks already passed. Agree on the environment and budgets before evaluating results.

| ID | Priority | Measurement | Evidence and interpretation |
|---|---|---|---|
| PERF01 | P2 | Capture navigation timing and transfer sizes with warm and cold caches. | Separate the Render platform's cold-start time from client time. Suggested budgets are p75 LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1 under defined mobile conditions. These are proposed targets, not results established by localhost runs. |
| PERF02 | P2 | Mark an action click, WebSocket send, authoritative `GAME_STATE` receipt, and UI paint over at least 30 legal moves at a fixed round-trip time. | Report median and p95 synchronization latency, naming the start and end events. Socket receipt must not be treated as UI paint. |
| PERF03 | P2 | Measure total dealing-animation duration and frame drops on a real low-end device. | Verify that controls remain disabled while the animation protects state. Record device, operating system, browser, and reduced-motion setting. |
| PERF04 | P2 | Run three or four local clients for functional consistency. | A small local client test is not a capacity result. Load or stress testing requires an isolated environment and an explicit capacity budget. Never flood a public server. |

## Traceability and planned automation coverage

The mappings below identify automation candidates and manual responsibilities. They are **coverage intent**, not evidence that the files have been implemented, the tests have run, or the listed manual scenarios have passed. Automated assertions usually cover only part of a manual case. Confirm actual test titles, assertions, project names, and run artifacts before crediting coverage.

| Planned automation area | Manual case IDs | Data or configured test family | Remaining manual responsibility |
|---|---|---|---|
| Rules and legal responses | G01–G08, G12–G14; U05; N01, N03, N06 | `game-rules.spec.ts`; `qa/data/rule-cases.ts` (`RULE-*`, `BEAT-*`) | Verify visible turn order, labels, interaction behavior, and source/requirement discrepancies. |
| Scoring and round continuity | L05; G09–G11; N02 | `scoring.spec.ts` | Confirm served-UI base-score behavior in solo and online play and inspect displayed totals. |
| Lobby and setup | L01–L10; N04, N07–N08 | `lobby.spec.ts` | Clipboard/share permissions, real-device navigation, Unicode rendering, and unsupported-feature assessment. |
| Multiplayer authority and convergence | M01–M04, M07, M09–M11; U01; N04–N05 | `multiplayer.spec.ts` | Timing-sensitive concurrency, slow networks, host transfer, and privacy review across independent sessions. |
| Disconnect and recovery | M05–M10; N05 | `reconnect.spec.ts` | Real network interruption, physical-device backgrounding, grace-period timing, and expired-session usability. |
| Localization | L02; U07, U11; N08 | `i18n.spec.ts` | Translation completeness, punctuation, long strings, and readability in each viewport. |
| Accessibility | U08–U11 | `accessibility.spec.ts` | Screen readers, keyboard journeys, manual contrast review, zoom, enlarged text, and physical touch targets. |
| Visual and interaction checks | U01–U04, U06, U08, U11; N07, N09 | `ui.spec.ts` | Actual screenshots, dense hands, touch overlap, audio, animation, safe areas, and device-specific behavior. |
| Performance and capacity | PERF01–PERF04 | Dedicated measurements to be added when an environment and budget are approved | Collect reproducible timing evidence and real-device measurements; separately authorize any stress workload. |

The Playwright configuration defines engine, desktop Chromium/Firefox/WebKit, mobile Chromium/WebKit, and tablet WebKit projects. A configured project is not an executed test. Record missing browsers, skipped tests, excluded known-issue tests, and unavailable devices explicitly. Emulation does not satisfy the physical-device matrix.

## Result recording and release exit criteria

Create a separate execution record for every case and material variant. Retain the stable case ID when linking defects or automated evidence.

| Field | Required content |
|---|---|
| Case and variant | Case ID; player count; normal/crazy mode; solo/online mode; locale; browser/device. |
| Build and environment | Commit SHA, build identifier, local/staging URL, UTC timestamp, and relevant server configuration. |
| Reproduction | Preconditions, seed where available, exact actions, and sanitized room/session context. |
| Result | `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`, with the actual observed result. Use `N/A` only with a verified reason. |
| Evidence | Screenshots, trace, logs, measurements, automated report/test title, and defect ID where applicable. |
| Follow-up | Owner, retest status, and any unexecuted variants or limitations. |

A release decision requires:

- All P0 cases pass for the required variants, with evidence tied to the release build.
- No unresolved critical- or high-severity defects remain.
- P1 failures are triaged and have an owner and an explicit release decision.
- Automated results identify the exact source SHA and distinguish passed, failed, skipped, excluded, blocked, and never-run coverage.
- The real-device matrix is signed off or explicitly identified as pending; a pending matrix is not a compatibility pass.
- Timer, chat, or sharing checks are marked `N/A` only after inspection confirms that the feature is absent or out of scope.
- Accessibility automation is supplemented by screen-reader and manual contrast review.

Automated coverage is a subset of this plan. Neither the existence of this document nor a passing subset of automated tests means every manual case was executed.
