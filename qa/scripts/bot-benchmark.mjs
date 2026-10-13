#!/usr/bin/env node
/**
 * Repeatable comparison with the pre-upgrade bot, using unchanged current rules.
 * Run from any directory: node qa/scripts/bot-benchmark.mjs
 * Fresh holdout example: --seed-start=1001 --seeds=40 --crazy-seeds=20
 * Optional baseline: --base=<git-ref> (defaults to the reviewed handoff commit).
 * One upgraded bot plays against baseline bots, rotating through EVERY seat of
 * each identical deal. Reports descriptive results, not a golden win-rate gate.
 * No network, server, browser installation, or repository writes are required.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const options = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const positive = (name, fallback) => {
  const value = Number(options[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
};
const seedStart = positive('seed-start', 1);
const seeds = positive('seeds', 20);
const crazySeeds = positive('crazy-seeds', 10);
const baseline = options.base ?? 'adff44577d117531044c910822d6b7d2c7d8e92e';
const temp = mkdtempSync(join(tmpdir(), 'gdy-bot-benchmark-'));
const sourceAtBaseline = path => execFileSync('git', ['show', `${baseline}:${path}`], { cwd: repo, encoding: 'utf8' });
const randomFor = seed => {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296);
};

try {
  const current = join(temp, 'current');
  execFileSync(process.execPath, [join(repo, 'node_modules/typescript/bin/tsc'), '--target', 'es2020',
    '--module', 'esnext', '--skipLibCheck', '--strict', '--outDir', current, 'shared/bot.ts'], { cwd: repo });
  writeFileSync(join(temp, 'package.json'), '{"type":"module"}');
  const baselineSource = sourceAtBaseline('shared/bot.ts').replace("'./engine.js'", "'./current/engine.js'");
  writeFileSync(join(temp, 'baseline.mjs'), ts.transpileModule(baselineSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText);
  const { chooseBotMove } = await import(pathToFileURL(join(current, 'bot.js')).href);
  const { chooseBotMove: baselineMove } = await import(pathToFileURL(join(temp, 'baseline.mjs')).href);
  const { newHand, getPlayerView, applyAction } = await import(pathToFileURL(join(current, 'engine.js')).href);
  const { createDeck, shuffle, barelyShuffle } = await import(pathToFileURL(join(current, 'deck.js')).href);
  const assets = ['gdy-shared-deck', 'gdy-shared-classify', 'gdy-shared-engine']
    .map(name => readFileSync(join(repo, `client/dist/js/${name}.js`), 'utf8')).join('\n');
  const browserSources = {
    baseline: sourceAtBaseline('client/dist/js/gdy-engine.js'),
    current: readFileSync(join(repo, 'client/dist/js/gdy-engine.js'), 'utf8'),
  };
  const browserBot = (version, seed) => {
    const math = Object.create(Math);
    math.random = randomFor(seed);
    const context = createContext({ Math: math });
    runInContext(`${assets}\n${browserSources[version]}`, context);
    return (view, playerCount) => {
      const cards = context.gdyBotPlay(view.selfHand, view.lastPlay?.combination ?? null, playerCount,
        view.players.filter(player => player.id !== view.selfId).map(player => player.cardCount));
      return cards ? { type: 'PLAY', cardIds: cards } : { type: 'PASS' };
    };
  };
  console.log(JSON.stringify({ baseline, seedStart, normalSeeds: seeds, crazySeeds,
    setup: 'One upgraded bot versus baseline opponents, every seat on identical deals. Higher win rate and lower average place are better.' }));
  const latency = { server: [], browser: [] };
  for (const implementation of ['server', 'browser']) {
    for (const crazy of [false, true]) {
      for (const playerCount of [3, 4]) {
        const seats = Array.from({ length: playerCount }, (_, i) => `p${i}`);
        let games = 0, wins = 0, places = 0, maxActions = 0;
        for (let seed = seedStart; seed < seedStart + (crazy ? crazySeeds : seeds); seed++) {
          const deck = (crazy ? barelyShuffle : shuffle)(createDeck().map(card => card.id), randomFor(seed * 12371));
          for (let upgradedSeat = 0; upgradedSeat < playerCount; upgradedSeat++) {
            let state = newHand(seats, playerCount, 1, seats[0], deck, 0);
            state.currentPlayerId = seats.find(seat => state.hands[seat].includes('S-4'));
            const currentBot = implementation === 'server' ? chooseBotMove : browserBot('current', seed * 71 + upgradedSeat);
            const oldBot = implementation === 'server' ? baselineMove : browserBot('baseline', seed * 71 + upgradedSeat);
            let actions = 0;
            while (state.status === 'PLAYING' && actions++ < 1500) {
              const player = state.currentPlayerId;
              const view = getPlayerView(state, player);
              const upgraded = player === seats[upgradedSeat];
              const start = performance.now();
              const move = (upgraded ? currentBot : oldBot)(view, playerCount);
              if (upgraded) latency[implementation].push(performance.now() - start);
              const result = applyAction(state, { ...move, actionId: String(actions), gameId: state.gameId,
                expectedRevision: state.revision }, { playerId: player, source: 'BOT' });
              if (!result.ok) throw new Error(`Illegal ${implementation} move: ${result.code}, seed ${seed}`);
              state = result.state;
              const cards = [...Object.values(state.hands).flat(), ...state.trickCards, ...state.discard];
              if (cards.length !== 54 || new Set(cards).size !== 54) throw new Error('Card conservation failure');
            }
            if (state.status !== 'FINISHED') throw new Error(`Nontermination at seed ${seed}`);
            const place = state.finishOrder.indexOf(seats[upgradedSeat]) + 1;
            wins += place === 1 ? 1 : 0;
            places += place;
            games++;
            maxActions = Math.max(actions, maxActions);
          }
        }
        console.log(JSON.stringify({ implementation, crazy, playerCount, games, wins,
          winPercent: +(100 * wins / games).toFixed(1), equalSkillPercent: +(100 / playerCount).toFixed(1),
          averagePlace: +(places / games).toFixed(2), maxActions }));
      }
    }
  }
  for (const [implementation, measurements] of Object.entries(latency)) {
    measurements.sort((a, b) => a - b);
    console.log(JSON.stringify({ implementation, decisions: measurements.length,
      medianMs: +measurements[Math.floor(measurements.length * 0.5)].toFixed(3),
      p95Ms: +measurements[Math.floor(measurements.length * 0.95)].toFixed(3),
      maxMs: +measurements[measurements.length - 1].toFixed(3) }));
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
