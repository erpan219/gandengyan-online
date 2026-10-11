# Coverage map and boundaries

This suite combines deterministic in-process contract tests with real browser/server journeys. It does not claim every item in the manual plan has been automated.

| Requested area | Automated evidence | Remaining manual or separate-environment coverage |
|---|---|---|
| Lobby | Mode selection, short/unknown code, 3p/4p create, AI fill, leave/recreate, invalid-join retry acceptance | All nickname boundaries, native clipboard/share permissions, actual TTL expiry, base-score product requirement |
| Card UI | Exact rendered hand IDs/counts, selection state, legal/invalid previews, Hint, pass state, responsive geometry | Human visual fidelity, neighboring-card legibility on real touch hardware, all animation states |
| Rules | All seven types, valid sequence lengths and starting ranks, natural-rank multiples, invalid sequences, rank/bomb comparison, action legality, deck conservation | Exhaustive state-space exploration is not claimed |
| Scoring | Real Match settlement, placement/bonus/rocket oracles, rejected moves, last-action bombs, cumulative rounds, displayed online totals and rematch | Product decision on unused base-score selector |
| Multiplayer | Independent contexts, private hands, shared updates, full room, simultaneous last-seat joins, actual complete hand, quick chat | Cross-engine players in the same room, many-room load and geographic networks |
| Reconnect | Actual transport closure, automatic reconnect, actual 30s AI takeover, bot move, token reclaim, lobby host transfer | 120s RESULTS grace expiry, long room TTL, all-offline cleanup, real mobile background suspension |
| i18n | CN/EN switch, document language, persistence, solo and online mid-hand state preservation | Every localized phrase, screen-reader pronunciation and expanded text review |
| Accessibility | Keyboard modal/card behavior, selection names, live invalid-play status, strict input/dialog naming acceptance | Full WCAG audit, contrast measurements, VoiceOver/NVDA, browser zoom, motion sensitivity |
| Performance | Measurement protocol and proposed budgets in manual plan | No benchmark, stress or production-load pass is claimed |

## Test-data semantics

The classification matrix may include pair-run lengths that cannot fit in an opening hand. Those cases validate the classifier's mathematical contract, not a claim that a player can receive 22 cards. Action/state fixtures enforce physical card uniqueness and place unused cards in the discard zone. Match integration tests replace only message delivery and timing; they execute the real scoring and engine methods.

Browser observations use real messages and DOM. A local-only WebSocket subclass retains transport handles for disconnection faults, but does not fabricate frames or force game state. All browser contexts have deterministic client-side randomness; server-side shuffling remains random and assertions avoid relying on one server deal. Full-hand automation follows legal actions from the actual game rather than setting a results screen.

## Source-grounded differences from the supplied summary

1. Room codes are six **alphanumeric characters**, not six digits.
2. Jokers are high singles or a two-joker rocket, never wildcards.
3. Crazy mode starts from a fresh canonical deck each hand, with 8–12 swaps. It does not preserve the previous hand's capture order.
4. The base-score selector is read into frontend configuration but does not currently multiply solo scores, and no online base-score field is transmitted. The pack documents that mismatch instead of pretending a multiplier exists.
5. The served UI is the tracked vanilla `client/dist`; rebuilding the separate React `client/src` would change the application being tested.

These findings are tied to commit aff6d613ee3fa47700ccc25431b2d279b019aaf5. Review them when the application changes.
