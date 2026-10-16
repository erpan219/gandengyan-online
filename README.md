# Gandengyan Online

A custom Gandengyan card-game variant: solo vs bots and online multiplayer,
bilingual (zh/en), red/gold theme. Live at https://gandengyan.onrender.com
(auto-deploys from `main`).

## Layout

- `server/src/` — Node + `ws` game server. Serves the client and runs rooms,
  matches, reconnect/AI-takeover grace, and rate limits. Entry: `server/src/index.ts`.
- `shared/` — TypeScript rules engine used by both server and browser:
  `engine.ts` (turns, validation, scoring events), `classify.ts` (combination
  rules), `deck.ts` (deck, shuffle, deal), `bot.ts` (bot move planner),
  `types.ts` (protocol and state shapes).
- `client/dist/` — the served vanilla-JS frontend (tracked in git). The
  `gdy-shared-*.js` bundles are **generated** from `shared/*.ts` — do not
  hand-edit them; rebuild with `node scripts/build-gdy-shared-<deck|classify|engine>.mjs`.
- `client/src/` — a separate React frontend. It is **not** the served UI and
  is not built by the Render deploy; kept for reference.
- `qa/` — Playwright + TypeScript QA suite (engine, browser, device projects).
  See `qa/README.md` for the tiered test gate: match the gate to the change size.

## Commands

```bash
npm --prefix server run build      # build server (Render buildCommand)
npm --prefix server start          # serve on PORT (default 3000)
cd qa && npm run typecheck        # QA typecheck
cd qa && npm run test:engine      # 790 engine tests, no browser needed
cd qa && npm run test:chromium    # Chromium desktop browser suite
```

## Deploy

`render.yaml` builds only the server; the client is served from tracked
`client/dist/`. GitHub Actions runs the full QA matrix on push (see
`.github/workflows/`). Standing rule: investigate before pushing — the local
gate must pass first so a push doesn't spam failure emails.

## Rules worth knowing

Room codes are six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
Jokers are not wildcards: high single cards, and together a rocket. Normal
sequences exclude 2, 3, and jokers. First place does not immediately stop the
hand — other players continue for ranking.
