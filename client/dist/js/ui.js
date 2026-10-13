// Fun random AI names (Qwen-generated)
const FUN_AI_NAMES = ["Uncle Wang", "Auntie Li", "Spicy Noodle", "Lucky Cat", "Dumpling Dragon", "Auntie Mei", "Uncle Chen", "Panda Bingo", "Hotpot Hero", "Grandma Zhao", "Uncle Fu", "Little Bao", "Tea Egg Tiger", "Auntie Hua", "Noodle Ninja", "Sesame Bunny", "Uncle Long", "Mooncake Moose", "Auntie Jin", "Wonton Wizard"];
function randomAIName(usedNames) {
  const available = FUN_AI_NAMES.filter(n => !usedNames.includes(n));
  const pool = available.length ? available : FUN_AI_NAMES;
  const name = pool[Math.floor(Math.random() * pool.length)];
  usedNames.push(name);
  return name;
}
function avatarForName(name) {
  return avatarPortrait(name, true);
}
// Animation keying: only animate when a NEW play lands, not on re-render.
// Each trick gets a fingerprint; animation plays only when fingerprint changes.
let _lastPlayFingerprint = null;
let _lastPassFingerprint = {};
// Reset pass tracking when trick clears
function resetPassTracking() { _lastPassFingerprint = {}; }
function playFingerprint(trickSeat, combo) {
  if (trickSeat == null || !combo || !combo.cards) return null;
  return trickSeat + ':' + combo.cards.map(c => c.id || (c.r + c.s)).sort().join(',');
}



'use strict';
/* ui.js — screens, rendering and game glue.
   Roles: 'local' (practice, everything in-page) or 'online' (server-driven
   via WebSocket; see net.js / online.js). */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const App = {
  autoPlay: false,
  turnTimer: null,
  turnDeadline: 0,
  turnSeq: 0,
  role: null,
  name: '',
  cfg: null,
  game: null,
  code: null,
  started: false,
  view: null,
  selected: new Set(),
  bubbles: {},
  _invalidReason: '',
  _lastActor: undefined,
  _oppDeadline: 0,
};

/* ---------------- generic helpers ---------------- */

function showScreen(id) {
  $$('.screen').forEach(el => el.classList.toggle('active', el.id === id));
  GdyViewport.sync();
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toast-wrap').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const RANK_LABELS = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
const SUITS = ['♠', '♥', '♦', '♣'];
function rankLabel(r) {
  if (r === 16) return t('jk_small');
  if (r === 17) return t('jk_big');
  return RANK_LABELS[r];
}

/* Canonical UI combo-type -> engine kind. Adapters and the selection
   classifier use 'triplebomb'/'fourbomb'; tolerate the underscored
   spellings too so a producer change can never silently degrade to SINGLE. */
function uiKindToGdy(type) {
  const k = String(type || '').toLowerCase();
  switch (k) {
    case 'single': return 'SINGLE';
    case 'pair': return 'PAIR';
    case 'straight': return 'STRAIGHT';
    case 'pair_run': return 'PAIR_RUN';
    case 'triplebomb':
    case 'triple_bomb': return 'TRIPLE_BOMB';
    case 'fourbomb':
    case 'four_bomb': return 'FOUR_BOMB';
    case 'rocket': return 'ROCKET';
    default:
      if (typeof console !== 'undefined') console.warn('[gdy] unknown combo type:', type);
      return 'SINGLE';
  }
}

function comboName(combo) {
  if (!combo) return '';
  if (combo.type === 'bomb') {
    if (combo.laiziBomb) return t('c_laizi_bomb');
    return t('c_bomb') + (combo.soft ? ' · ' + t('c_soft') : '');
  }
  let s = t('c_' + combo.type);
  if (combo.soft) s += ' · ' + t('g_laizi');
  return s;
}

function prevFor(v) {
  return v.trick.combo && v.trick.seat !== v.mySeat ? v.trick.combo : null;
}

/* ---------------- static texts / language ---------------- */

function applyStaticTexts() {
  const set = (id, key) => { const el = $(id); if (el) el.textContent = t(key); };
  set('#t-title', 'title'); set('#t-subtitle', 'subtitle');
  set('#t-name', 'h_name'); set('#t-mode', 'h_mode');
  set('#t-mode3', 'm_3p'); set('#t-mode3d', 'm_3p_d');
  set('#t-mode4', 'm_4p'); set('#t-mode4d', 'm_4p_d');
  set('#t-mclassic', 'm_classic'); set('#t-mclassic-d', 'm_classic_d');
  set('#t-mduel', 'm_duel'); set('#t-mduel-d', 'm_duel_d');
  set('#t-mteam', 'm_team'); set('#t-mteam-d', 'm_team_d');
  set('#t-options', 'h_options');
  set('#t-olaizi', 'o_laizi'); set('#t-olaizi-d', 'o_laizi_d');
  set('#t-onoshuffle', 'o_noshuffle'); set('#t-onoshuffle-d', 'o_noshuffle_d');
  set('#t-odoubling', 'o_doubling'); set('#t-odoubling-d', 'o_doubling_d');
  set('#t-bcreate', 'b_create'); set('#t-bcreate-d', 'b_create_d');
  set('#t-bpractice', 'b_practice'); set('#t-bpractice-d', 'b_practice_d');
  set('#t-join', 'h_join'); set('#t-rcode', 'r_code');
  set('#t-help-title', 'help_title');
  $('#btn-help').textContent = t('b_help');
  $('#btn-join').textContent = t('b_join');
  $('#btn-copy').textContent = t('b_copy');
  $('#btn-start').textContent = t('b_start');
  $('#btn-leave-room').textContent = t('b_leave');
  $('#inp-code').placeholder = t('ph_code');
  $('#btn-lang').textContent = LANG === 'zh' ? 'EN' : '中文';
  for (const id of ['#btn-bgm', '#btn-bgm2']) { const el = $(id); el.title = t('tt_bgm'); el.setAttribute('aria-label', t('tt_bgm')); }
  for (const id of ['#btn-snd', '#btn-snd2']) { const el = $(id); el.title = t('tt_snd'); el.setAttribute('aria-label', t('tt_snd')); }
  // Icon-only controls need programmatic names (PR6 targeted a11y).
  $('#btn-help-close').setAttribute('aria-label', t('a11y_close'));
  $('#btn-exit-game').setAttribute('aria-label', t('a11y_exit'));
  const chatBtn = $('#btn-chat');
  if (chatBtn) chatBtn.setAttribute('aria-label', t('a11y_chat'));
  $('#btn-lang2').textContent = LANG === 'zh' ? 'EN' : '中文';
  $('#help-body').innerHTML = t('help_body');
  document.documentElement.lang = LANG === 'zh' ? 'zh' : 'en';
}

/* ---------------- home / config ---------------- */

function cfgFromForm() {
  return {
    mode: ($$('input[name=mode]').find(r => r.checked) || {}).value || 'gdy3',
    laizi: false,
    noShuffle: $('#opt-noshuffle').checked,
    doubling: false,
  };
}

function myName() {
  const v = $('#inp-name').value.trim();
  const name = v || ('Player' + Math.floor(Math.random() * 900 + 100));
  try { localStorage.setItem('ddz_name', name); } catch (e) { }
  return name;
}

/* ---------------- room (waiting) screen ---------------- */

function seatsForMode(mode) { return mode === 'gdy4' ? 4 : 3; }
function roomCapacity() { return App.cfg ? seatsForMode(App.cfg.mode) : 3; }

/* Online (WebSocket) room screen — driven by server ROOM_STATE */
function updateRoomScreenOnline(msg) {
  App.code = msg.roomCode;
  $('#room-code').textContent = msg.roomCode || '';
  const seats = msg.seats || [];
  const capacity = msg.playerCount || seats.length;
  const waiting = seats.length < capacity;
  $('#room-status').textContent = waiting ? t('r_waiting') : '';
  // Render roster from server seats
  const wrap = $('#room-players');
  if (wrap) {
    wrap.innerHTML = seats.map(s =>
      `<div class="roster-row"><span class="avatar">${avatarPortrait(s.name, s.isBot)}</span>` +
      `<span>${esc(s.name)}</span>` +
      `${s.playerId === msg.hostId ? `<span class="tag">${t('r_host')}</span>` : ''}` +
      `${s.ready ? '<span class="tag">✓</span>' : ''}</div>`).join('');
  }
  // Show start button for host, ready button for guests
  const isHost = msg.hostId && Online.playerId === msg.hostId;
  const btnStart = $('#btn-start');
  if (btnStart) btnStart.style.display = isHost ? '' : 'none';
  // Only switch to room screen when in lobby phase AND game screen is not active.
  // During PLAYING, ROOM_STATE updates (bot moves, reconnects, etc.) must NOT
  // yank the player back from the game table to the waiting room.
  // Belt-and-suspenders: check both the message phase and the actual DOM state,
  // in case a stale/missing phase arrives.
  const gameScreenActive = (() => {
    try {
      const el = document.getElementById('screen-game');
      return el && el.classList.contains('active');
    } catch (e) { return false; }
  })();
  if (msg.phase !== 'PLAYING' && !gameScreenActive) {
    showScreen('screen-room');
  }
  setCreateBusy(false);
  if (typeof setJoinBusy === 'function') setJoinBusy(false);
}

/* ---------------- local game plumbing ---------------- */

function pushViews() {
  const g = App.game;
  if (!g) return;
  App.view = g.buildView(0);
  renderGame();
}

function newGame(players) {
  // Reset auto-play on new game
  App.autoPlay = false;
  clearTurnTimer();
  App.game = new Game(Object.assign({}, App.cfg, { players, playerCount: seatsForMode(App.cfg.mode) }), {
    onUpdate: () => pushViews(),
    onEvent: (ev) => {
      if (ev === 'redeal') { toast(t('e_redeal')); }
    },
    onError: (e) => console.error(e),
  });
  App.started = true;
  App.selected = new Set();
  showScreen('screen-game');
  App.game.startRound();
}

function startPractice() {
  App.name = myName();
  App.cfg = cfgFromForm();
  App.role = 'local';
  const players = [{ name: App.name }];
  const total = seatsForMode(App.cfg.mode);
  (() => { const used = [App.name]; while (players.length < total) players.push({ name: randomAIName(used), isAI: true }); })();
  newGame(players);
}

function setCreateBusy(busy) {
  const btn = $('#btn-create');
  btn.disabled = busy;
  $('#t-bcreate').textContent = busy ? t('connecting') : t('b_create');
}

function createRoom(attempt) {
  if (!netAvailable()) { toast(t('e_net')); return; }
  App.name = myName();
  App.cfg = cfgFromForm();
  App.role = 'online';
  setCreateBusy(true);
  const playerCount = seatsForMode(App.cfg.mode);
  // Try to restore token
  try { Online.token = localStorage.getItem('gdy_token') || null; } catch (e) {}
  Online.createRoom(App.name, playerCount, true, App.cfg.noShuffle);
  // Room screen will show on ROOM_STATE
  App._roomPending = true;
}

function hostStartGame() {
  if (App.role === 'online') {
    Online.startGame();
    return;
  }
  // Local practice: me + AI fill.
  const players = [{ name: App.name }];
  (() => { const used = players.map(p => p.name); while (players.length < roomCapacity()) players.push({ name: randomAIName(used), isAI: true }); })();
  newGame(players);
}

function dispatchAct(seat, kind, data, onErr) {
  const g = App.game;
  if (!g) return;
  let ok = true;
  data = data || {};
  if (kind === 'bid') ok = g.actBid(seat, data.v | 0);
  else if (kind === 'double') ok = g.actDouble(seat, !!data.yes);
  else if (kind === 'play') ok = g.actPlay(seat, Array.isArray(data.ids) ? data.ids : []);
  else if (kind === 'pass') ok = g.actPass(seat);
  else if (kind === 'again') { if (g.nextRound) g.nextRound(); }
  if (!ok && onErr) onErr();
}

/* ---------------- online (WebSocket) plumbing ---------------- */

function setJoinBusy(busy) {
  App._joinPending = busy;
  const btn = $('#btn-join');
  btn.disabled = busy;
  btn.textContent = busy ? t('connecting') : t('b_join');
}

function clearJoinTimer() {
  if (App._joinTimer) { clearTimeout(App._joinTimer); App._joinTimer = null; }
  setJoinBusy(false);
}

function joinRoom() {
  if (!netAvailable()) { toast(t('e_net')); return; }
  const code = $('#inp-code').value.trim().toUpperCase();
  if (code.length !== 6) { toast(t('e_room404')); return; }
  App.name = myName();
  App.role = 'online';
  App.code = code;
  setJoinBusy(true);
  try { Online.token = localStorage.getItem('gdy_token') || null; } catch (e) {}
  Online.joinRoom(code, App.name);
}

/* ---------------- network diagnostics ---------------- */

/* ---------------- shared action entry ---------------- */

function act(kind, data) {
  // Edge case 1: any human action cancels the timeout timer
  if (kind === 'play' || kind === 'pass') {
    clearTurnTimer();
    App.turnSeq++; // invalidate any pending timeout
  }
  if (App.role === 'online') {
    data = data || {};
    if (kind === 'play') Online.playCards(Array.isArray(data.ids) ? data.ids : []);
    else if (kind === 'pass') Online.pass();
    else if (kind === 'again') Online.startGame(); // next hand via START_GAME
    else if (kind === 'chat') {
      const txt = (t('chat') && t('chat')[data.id]) || '';
      if (txt) Online.chat(txt);
      showBubble(App.view ? App.view.mySeat : 0, txt);
    }
    return;
  }
  if (App.role === 'local' && kind === 'chat') { showBubble(0, t('chat')[data.id] || ''); return; }
  dispatchAct(0, kind, data, () => {
    toast(t('e_invalid'));
    Snd.invalid();
    const actions = $('#actions');
    if (actions) {
      actions.classList.remove('shake');
      void actions.offsetWidth; // restart animation
      actions.classList.add('shake');
    }
  });
}

/* ---------------- game rendering ---------------- */

function seatSides(v) {
  // My seat at the bottom; play order flows to the right.
  if (v.n === 2) return { left: null, right: null, top: (v.mySeat + 1) % 2 };
  if (v.n === 4) return { left: (v.mySeat + 3) % 4, right: (v.mySeat + 1) % 4, top: (v.mySeat + 2) % 4 };
  return { left: (v.mySeat + 2) % 3, right: (v.mySeat + 1) % 3, top: null };
}







function canBeat(v) {
  const c = v.trick.combo;
  if (!c || !c.cards) return true;  // No trick to beat, or invalid
  // Check if player has any card that can beat
  const handIds = v.myHand.map(card => card.id);
  const prevCombo = {
    kind: uiKindToGdy(c.type),
    cardCount: c.cards.length,
    strength: c.rank,
  };
  const plays = gdyFindPlays(handIds, prevCombo, v.n || 3);
  return plays.length > 0;
}

/* ============ Game Feel Effects ============ */
/* Sound effects are driven by diffing consecutive views, so they fire
   identically for local play, host and guest. */
function showComboBurst(text) {
  const table = $('#table-mid') || $('#table');
  if (!table) return;
  const el = document.createElement('div');
  el.className = 'combo-burst';
  el.textContent = text;
  table.style.position = 'relative';
  table.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => el.remove(), 1300);
}

function showScorePopup(text) {
  const table = $('#table') || document.body;
  const el = document.createElement('div');
  el.className = 'score-popup';
  el.textContent = text;
  table.style.position = 'relative';
  table.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => el.remove(), 1600);
}

function celebrate() {
  const colors = ['#f5c04e', '#ffd700', '#ff6b6b', '#ff8c42', '#fff'];
  const phoneSurface = $('#game-viewport.phone-game');
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + (phoneSurface ? '%' : 'vw');
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = (2 + Math.random() * 2) + 's';
    p.style.animationDelay = (Math.random() * 0.5) + 's';
    (phoneSurface || document.body).appendChild(p);
    setTimeout(() => p.remove(), 4500);
  }
}

function sndSig(v) {
  return {
    round: v.roundNo,
    state: v.state,
    actor: v.actor,
    plays: v.players.map(p => {
      const lp = p.lastPlay;
      if (!lp) return '';
      return lp.pass ? 'P' : lp.cards.map(c => c.id).join('-');
    }),
    bids: v.players.map(p => (p.bid === null || p.bid === undefined) ? '' : String(p.bid)).join(','),
    dbls: v.players.map(p => (p.dbl === null || p.dbl === undefined) ? '' : (p.dbl ? '1' : '0')).join(','),
  };
}

function playSounds(v) {
  const prev = App._snd;
  const cur = sndSig(v);
  App._snd = cur;
  if (!prev || prev.round !== cur.round) {
    if (v.state === 'bidding') Snd.deal();
    return;
  }
  for (let i = 0; i < v.players.length; i++) {
    if (cur.plays[i] === prev.plays[i] || cur.plays[i] === '') continue;
    if (cur.plays[i] === 'P') { Snd.pass(); continue; }
    const c = v.players[i].lastPlay.combo;
    if (c && c.type === 'rocket') { Snd.rocket(); showComboBurst('🚀 ' + t('c_rocket')); Snd.combo(); }
    else if (c && (c.type === 'bomb' || uiKindToGdy(c.type) === 'TRIPLE_BOMB' || uiKindToGdy(c.type) === 'FOUR_BOMB')) {
      Snd.bomb(); showComboBurst('💣 ' + t('c_bomb')); Snd.combo();
    }
    else if (c && c.type === 'straight') { Snd.play(); showComboBurst(t('c_straight')); }
    else if (c && c.type === 'pair_run') { Snd.play(); showComboBurst(t('c_pair_straight')); }
    else Snd.play();
  }
  if (cur.bids !== prev.bids) Snd.bid();
  if (cur.dbls !== prev.dbls) Snd.dbl();
  if (v.state === 'settle' && prev.state !== 'settle' && v.result) {
    const r = v.result;
    const iWon = r.landlordWon ? v.mySeat === v.landlord : v.mySeat !== v.landlord;
    if (iWon) { Snd.win(); celebrate(); showScorePopup('🎉 ' + t('you_win')); } else Snd.lose();
    return;
  }
  if (v.state === 'playing' && cur.actor === v.mySeat && prev.actor !== v.mySeat) Snd.turn();
}


/* ---------------- turn timeout & auto-play ---------------- */
const TURN_TIMEOUT_MS = 30000;

/* One 250ms ticker drives every turn timer on screen: my #turn-countdown
   and the active opponent's [data-opp-timer] chip. Elements are looked up
   each tick because re-renders replace them. */
let _turnTick = null;
function startTurnTicker() {
  stopTurnTicker();
  _turnTick = setInterval(() => {
    const now = Date.now();
    const own = document.getElementById('turn-countdown');
    if (own && App.turnDeadline) {
      const r = Math.max(0, Math.ceil((App.turnDeadline - now) / 1000));
      own.textContent = r + 's';
      own.classList.toggle('urgent', r <= 10);
    }
    const opp = document.querySelector('[data-opp-timer]');
    if (opp && App._oppDeadline) {
      const r = Math.max(0, Math.ceil((App._oppDeadline - now) / 1000));
      opp.textContent = r + 's';
      opp.classList.toggle('urgent', r <= 10);
    }
  }, 250);
}
function stopTurnTicker() {
  if (_turnTick) { clearInterval(_turnTick); _turnTick = null; }
}

function clearTurnTimer() {
  if (App.turnTimer) {
    clearTimeout(App.turnTimer);
    App.turnTimer = null;
  }
  stopTurnTicker();
  const el = document.getElementById('turn-countdown');
  if (el) el.textContent = '';
}

function startTurnTimer() {
  clearTurnTimer();
  if (App.autoPlay) return;
  App.turnSeq++;
  const seq = App.turnSeq;
  App.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
  App.turnTimer = setTimeout(() => onTurnTimeout(seq), TURN_TIMEOUT_MS);
  // Start the ticker after DOM updates
  setTimeout(startTurnTicker, 50);
}

function onTurnTimeout(seq) {
  // Edge case 5: ignore stale timers from previous turns
  if (seq !== App.turnSeq) return;
  const v = App.view;
  if (!v || v.state !== 'playing' || v.actor !== v.mySeat) return;
  // Edge case 1: double-check user hasn't acted (timer should've been cleared)
  if (App.autoPlay) return;
  App.autoPlay = true;
  toast(t('autoplay_on'));
  renderGame();
  setTimeout(() => autoPlayMove(seq), 2000); // 2s delay so user can cancel
}

function autoPlayMove(seq) {
  const v = App.view;
  if (!v || !App.autoPlay) return;
  // Edge case 5: stale auto-play call
  if (seq !== undefined && seq !== App.turnSeq) return;
  // Edge case 2: game ended during auto-play
  if (v.state !== 'playing' || v.actor !== v.mySeat) {
    App.autoPlay = false;
    clearTurnTimer();
    return;
  }

  // Use AI logic to determine best move
  const handIds = v.myHand.map(c => c.id);
  const prev = prevFor(v);
  const target = prev && prev.cards ? prevToCombo(prev, v.n || 3) : null;
  const oppCounts = v.players.filter((p, seat) => seat !== v.mySeat && p.cardCount > 0).map(p => p.cardCount);
  const play = gdyBotPlay(handIds, target, v.n || 3, oppCounts);

  if (play && play.length) {
    act('play', { ids: play });
  } else if (target) {
    act('pass');
  } else {
    // Free lead but no play found (shouldn't happen) - play lowest single
    const sorted = handIds.slice().sort((a, b) => gdyCardRank(a).length - gdyCardRank(b).length);
    if (sorted.length) act('play', { ids: [sorted[0]] });
  }
  // Schedule next auto-play move if still our turn after this one
  // (renderGame will trigger via state update, but add fallback)
}

function cancelAutoPlay() {
  App.autoPlay = false;
  clearTurnTimer();
  toast(t('autoplay_off'));
  renderGame();
  // Restart timer for current turn
  const v = App.view;
  if (v && v.state === 'playing' && v.actor === v.mySeat) {
    startTurnTimer();
  }
}

// Convert prev play to combo format for AI
function prevToCombo(prev, playerCount) {
  if (!prev || !prev.cards || !prev.cards.length) return null;
  const cls = gdyClassify(prev.cards.map(c => c.id || c), playerCount);
  return cls.ok ? cls.combination : null;
}


/* Doudizhu-style table transitions: beaten plays fade/slide out while the new
 * play deals in; pass bubbles linger ~1.6s then fade. midHTML() already keys
 * animations to new plays/passes via fingerprints; this handles the outgoing
 * side, which a plain innerHTML swap would drop instantly. */
function renderTableMid(v, mount) {
  // Snapshot the currently displayed plays per table spot.
  const before = new Map();
  mount.querySelectorAll('.table-spot').forEach(spot => {
    const pos = [...spot.classList].find(c => c.indexOf('ts-') === 0);
    const cards = spot.querySelector(':scope > .table-cards:not(.leaving)');
    if (pos && cards) before.set(pos, cards.cloneNode(true));
  });
  mount.innerHTML = midHTML(v);
  const center = mount.querySelector('#center-table') || mount;
  // Overlay fading ghosts for plays that were replaced.
  for (const [pos, oldCards] of before) {
    const spot = center.querySelector('.table-spot.' + pos);
    const replaced = !spot || !spot.querySelector(':scope > .table-cards');
    if (!replaced) continue;
    oldCards.classList.add('leaving');
    oldCards.classList.remove('no-anim');
    const ghost = document.createElement('div');
    ghost.className = 'table-spot ' + pos;
    ghost.style.pointerEvents = 'none';
    ghost.appendChild(oldCards);
    center.appendChild(ghost);
    setTimeout(() => ghost.remove(), 400);
  }
}


function renderGame() {
  const v = App.view;
  if (!v) {
    clearTurnTimer();
    return;
  }
  // Wrap sounds in try-catch: effect errors must never break UI rendering
  try { playSounds(v); } catch (e) { console.error('playSounds error:', e); }
  // Game over: clear timeout state
  if (v.state === 'settle' || v.state === 'gameover') {
    clearTurnTimer();
    App.autoPlay = false;
  }
  // Turn timers: mine on my turn; an approximate countdown on the active
  // opponent's panel otherwise (resets on every action broadcast).
  const isMyTurn = v.state === 'playing' && v.actor === v.mySeat;
  if (v.roundNo !== App._lastRound) { App._lastRound = v.roundNo; App._lastActor = undefined; }
  if (v.actor !== App._lastActor) {
    App._lastActor = v.actor;
    App._oppDeadline = Date.now() + TURN_TIMEOUT_MS;
  }
  if (isMyTurn) {
    if (App.autoPlay) {
      clearTurnTimer();
      const seq = App.turnSeq;
      setTimeout(() => autoPlayMove(seq), 2000); // 2s delay so user can cancel
    } else if (!App.turnTimer) {
      startTurnTimer();
    }
  } else if (v.state === 'playing' && v.actor !== null && v.actor !== undefined && v.actor !== v.mySeat) {
    clearTurnTimer();
    startTurnTicker();
  } else {
    clearTurnTimer();
  }
  // prune stale selection
  const handIds = new Set(v.myHand.map(c => c.id));
  for (const id of [...App.selected]) if (!handIds.has(id)) App.selected.delete(id);

  $('#center-info').innerHTML = centerHTML(v);
  const sides = seatSides(v);
  $('#opp-left').innerHTML = sides.left !== null ? oppPanelHTML(v, sides.left) : '';
  $('#opp-right').innerHTML = sides.right !== null ? oppPanelHTML(v, sides.right) : '';
  const seatTop = $('#seat-top');
  if (seatTop) {
    seatTop.innerHTML = sides.top !== null ? oppPanelHTML(v, sides.top) : '';
    seatTop.style.display = sides.top !== null ? '' : 'none';
  }
  renderTableMid(v, $('#table-mid'));
  GdyViewport.fitPlays();

  // my last play is shown in center pos-bottom, hide the old line
  const myLastEl = $('#my-lastplay');
  if (myLastEl) {
    if (v.state === 'playing' && v.actor === v.mySeat && !prevFor(v) && !v.players[v.mySeat].lastPlay) {
      myLastEl.innerHTML = `<span class="say lead">${t('lead_any')}</span>`;
    } else {
      myLastEl.innerHTML = '';
    }
  }

  $('#actions').innerHTML = actionsHTML(v);
  $('#my-hand').innerHTML = v.myHand.map(c =>
    cardHTML(c, App.selected.has(c.id) ? 'sel' : '', v.laizi, true)).join('');
  layoutHand();
  $('#my-info').innerHTML = myInfoHTML(v);
  $('#btn-chat').style.display = App.role === 'local' ? 'none' : '';

  bindActionButtons();
  renderBubbles();

  if (v.landlord != null && App._lordSeen !== v.roundNo) {
    App._lordSeen = v.roundNo;
    animateLandlord(v);
  }

  if (v.state === 'settle' && v.result) renderSettle(v);
  else $('#settle-overlay').classList.add('hidden');
}

/* Landlord reveal: banner + the kitty cards flying into the landlord's
   hand (or seat panel). Purely cosmetic overlay clones. */
function animateLandlord(v) {
  Snd.landlord();
  const banner = document.createElement('div');
  banner.className = 'lord-banner';
  banner.textContent = '👑 ' + t('lord_banner', v.players[v.landlord].name);
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('show'), 20);
  setTimeout(() => { banner.classList.remove('show'); setTimeout(() => banner.remove(), 400); }, 1800);

  const srcCards = $$('#table-mid .bottom-cards .card');
  const target = v.landlord === v.mySeat ? $('#my-hand')
    : ($(`.opp[data-seat="${v.landlord}"]`) || $('#table-mid'));
  if (!srcCards.length || !target) return;
  const tr = target.getBoundingClientRect();
  const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
  srcCards.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.classList.add('fly-card');
    clone.style.left = r.left + 'px';
    clone.style.top = r.top + 'px';
    clone.style.width = r.width + 'px';
    clone.style.height = r.height + 'px';
    document.body.appendChild(clone);
    requestAnimationFrame(() => {
      clone.style.transform = 'scale(1.9)';
      setTimeout(() => {
        clone.style.transform =
          `translate(${tx - (r.left + r.width / 2)}px, ${ty - (r.top + r.height / 2)}px) scale(.35)`;
        clone.style.opacity = '0';
      }, 650 + i * 130);
    });
    setTimeout(() => clone.remove(), 1700 + i * 130);
  });
}

// Event delegation: single listener on #actions survives innerHTML re-renders.
// Fixes bug where buttons rendered but clicks did nothing after rapid re-renders.
let _actionsDelegated = false;
function bindActionButtons() {
  if (_actionsDelegated) return;
  _actionsDelegated = true;
  const el = $('#actions');
  if (!el) return;
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act],[data-bid],[data-dbl]');
    if (!btn) return;
    if (btn.disabled) return;
    if (btn.dataset.bid !== undefined) { act('bid', { v: +btn.dataset.bid }); return; }
    if (btn.dataset.dbl !== undefined) { act('double', { yes: +btn.dataset.dbl === 1 }); return; }
    const kind = btn.dataset.act;
    if (kind === 'hint') doHint();
    else if (kind === 'pass') { App.selected.clear(); act('pass'); }
    else if (kind === 'cancel-autoplay') cancelAutoPlay();
    else if (kind === 'play') {
      if (btn.dataset.invalid) invalidPlayFeedback();
      else act('play', { ids: [...App.selected] });
    }
  });
}

/* Tapping 出牌 with an illegal selection: shake the hand, buzz, explain. */
function invalidPlayFeedback() {
  const hand = $('#my-hand');
  if (hand) {
    hand.classList.remove('shake');
    void hand.offsetWidth; // restart animation
    hand.classList.add('shake');
  }
  Snd.invalid();
  if (App._invalidReason) toast(App._invalidReason);
}

/* Drag across the hand to (de)select a run of cards; a plain tap still
   toggles one card. Bound once in boot() — the hand element persists. */
function bindHandDrag() {
  const handEl = $('#my-hand');
  // Keyboard support: Enter/Space toggles card selection
  handEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.card[data-id]');
    if (!card) return;
    e.preventDefault();
    const id = card.dataset.id;
    if (App.selected.has(id)) { App.selected.delete(id); Snd.tick(); }
    else { App.selected.add(id); Snd.select(); }
    renderGame();
    // Keep focus on the same card for repeated keyboard actions
    const newCard = handEl.querySelector(`.card[data-id="${id}"]`);
    if (newCard) newCard.focus();
  });
  let drag = null;
  const cardIdAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest('#my-hand .card');
    return c ? c.dataset.id : null;
  };
  const applySel = (id, on) => {
    if (on) { App.selected.add(id); Snd.select(); } else { App.selected.delete(id); Snd.tick(); }
    renderGame();
    // Restore focus to the same card after rerender
    const card = handEl.querySelector(`.card[data-id="${id}"]`);
    if (card) card.focus();
  };
  handEl.addEventListener('pointerdown', e => {
    const id = cardIdAt(e.clientX, e.clientY);
    if (id === null || id === '') return;
    e.preventDefault();
    try { handEl.setPointerCapture(e.pointerId); } catch (err) { }
    drag = { on: !App.selected.has(id), touched: new Set([id]) };
    applySel(id, drag.on);
  });
  handEl.addEventListener('pointermove', e => {
    if (!drag) return;
    const id = cardIdAt(e.clientX, e.clientY);
    if (id === null || drag.touched.has(id)) return;
    drag.touched.add(id);
    applySel(id, drag.on);
  });
  const end = () => { drag = null; };
  handEl.addEventListener('pointerup', end);
  handEl.addEventListener('pointercancel', end);
}

/* Compress card overlap so the whole hand always fits the screen. */
function layoutHand() {
  const handEl = $('#my-hand');
  const cards = handEl.children;
  const n = cards.length;
  if (!n) return;
  const cw = cards[0].offsetWidth;
  const avail = handEl.clientWidth - 20;
  const phoneLandscape = $('#game-viewport').classList.contains('phone-game');
  let step = phoneLandscape ? cw * .58 : cw - (window.innerWidth <= 720 ? 22 : 30);
  if (cw + step * (n - 1) > avail) step = Math.max(11, (avail - cw) / (n - 1));
  for (let i = 1; i < n; i++) cards[i].style.marginLeft = (step - cw) + 'px';
}

function doHint() {
  const v = App.view;
  if (!v || !v.myHand) return;
  // Convert ui card objects back to CardIds
  const handIds = v.myHand.map(c => c.id);
  // Convert prev combo from ui format to gdy format
  let prev = null;
  const p = prevFor(v);
  if (p && p.cards) {
    // p is {type, rank, cards} from our buildView trick
    // Reconstruct a minimal combination for gdyCanBeat
    prev = {
      kind: uiKindToGdy(p.type),
      cardCount: p.cards.length,
      strength: p.rank,
      cardIds: p.cards.map(c => c.id),
    };
  }
  const n = v.n || 3;
  // Opponent card counts for smart hints (same as AI sees)
  const oppCounts = v.players
    .map((p, i) => i === v.mySeat ? -1 : p.cardCount)
    .filter(c => c >= 0);
  const play = gdyHint(handIds, prev, n, oppCounts);
  if (!play || !play.length) { if (prev) { App.selected.clear(); act('pass'); } return; }
  // Show hint explanation
  const expl = gdyHintExplanation();
  if (expl) {
    const reasonText = {
      'tempo': 'take_tempo', 'efficient': 'efficient_dump', 'save_high': 'save_high',
      'breaks_bomb': 'breaks_bomb', 'block_win': 'block_win', 'endgame': 'endgame_push',
      'save_bomb': 'save_bomb', 'dump_low': 'dump_low', 'wasteful': 'wasteful_warn', 'safe': 'safe_play'
    };
    const confText = { 'best': 'hint_best', 'good': 'hint_good', 'safe': 'hint_safe' };
    toast(t(reasonText[expl.reason] || 'safe_play') + ' · ' + t(confText[expl.confidence] || 'hint_safe'));
  }
  App.selected = new Set(play);
  renderGame();
}

/* ---------------- bubbles / chat ---------------- */

function showBubble(seat, text) {
  if (!text) return;
  Snd.chat();
  if (App.bubbles[seat]) clearTimeout(App.bubbles[seat].timer);
  App.bubbles[seat] = { text, timer: setTimeout(() => { delete App.bubbles[seat]; renderBubbles(); }, 3200) };
  renderBubbles();
}

function renderBubbles() {
  const v = App.view;
  if (!v) return;
  $$('.bubble-slot').forEach(el => el.innerHTML = '');
  for (const [seatStr, b] of Object.entries(App.bubbles)) {
    const seat = +seatStr;
    let slot = null;
    if (seat === v.mySeat) slot = $('#my-info .bubble-slot');
    else {
      const panel = $(`.opp[data-seat="${seat}"] .bubble-slot`);
      if (panel) slot = panel;
    }
    if (slot) slot.innerHTML = `<span class="bubble">${esc(b.text)}</span>`;
  }
}

function toggleChatPop() {
  const pop = $('#chat-pop');
  if (!pop.classList.contains('hidden')) { pop.classList.add('hidden'); return; }
  pop.innerHTML = t('chat').map((p, i) => `<button data-chat="${i}">${esc(p)}</button>`).join('');
  pop.classList.remove('hidden');
  $$('#chat-pop [data-chat]').forEach(b => b.onclick = () => {
    act('chat', { id: +b.dataset.chat });
    pop.classList.add('hidden');
  });
}

/* ---------------- settle overlay ---------------- */

function renderSettle(v) {
  const r = v.result;
  if (!r || !r.finishOrder) return;
  const myPlace = r.finishOrder.indexOf(v.mySeat) + 1;
  const iWon = myPlace === 1;
  const placeNames = ['🏆', '🥈', '🥉', '4️⃣'];
  // Place points: 3P → 2/1/0, 4P → 3/2/1/0. Anything above is bomb bonus.
  const placePoints = v.n === 4 ? [3, 2, 1, 0] : [2, 1, 0];
  const rows = r.finishOrder.map((seat, idx) => {
    const p = v.players[seat];
    const pts = r.roundScores ? r.roundScores[seat] : 0;
    const bombBonus = Math.max(0, pts - (placePoints[idx] || 0));
    const bombTag = bombBonus > 0 ? ` <span class="bomb-tag">💣+${bombBonus}</span>` : '';
    return `<div class="settle-row ${seat === v.mySeat ? 'me' : ''}">
      <span>${placeNames[idx] || ''} ${esc(p.name)}</span>
      <span class="${pts > 0 ? 'plus' : ''}">+${pts}${bombTag}</span>
      <span class="total">${t('score_pts', p.score)}</span></div>`;
  }).join('');
  $('#settle-overlay').innerHTML = `<div class="settle-box ${iWon ? 'won' : 'lost'}">
    ${iWon ? '<div class="settle-burst"></div>' : ''}
    <h2>${iWon ? t('s_youwin') : t('s_youlose')}</h2>
    <p class="personal">${t('s_place', myPlace)}</p>
    <div class="settle-rows">${rows}</div>
    <div class="big-btns">
      <button id="btn-again" class="primary">${t('b_again')}</button>
      <button id="btn-settle-home">${t('b_home')}</button>
    </div></div>`;
  $('#settle-overlay').classList.remove('hidden');
  $('#btn-again').onclick = () => act('again');
  $('#btn-settle-home').onclick = goHome;
}

/* ---------------- navigation / cleanup ---------------- */

/* Confirm before exiting a game */
function confirmExit() {
  // If not in a game, just go home
  if (!App.game && App.role !== 'online') { goHome(); return; }

  const isOnline = App.role === 'online';
  const msg = isOnline
    ? t('exit_confirm_online')
    : t('exit_confirm');

  // Simple confirm dialog
  if (confirm(msg)) {
    if (isOnline) {
      // Notify server - AI will take over
      try { netClose(); } catch (e) {}
    }
    goHome();
  }
}

function goHome() {
  clearJoinTimer();
  const wasOnline = App.role === 'online';
  App._netSession = (App._netSession || 0) + 1;
  if (App.game) { App.game.stop(); App.game = null; }
  App.role = null;
  App.started = false;
  App.view = null;
  App.selected = new Set();
  App.bubbles = {};
  App._snd = null;
  App._lordSeen = null;
  App._hintSig = null;
  App._beatSig = null;
  if (App._joinTimer) { clearTimeout(App._joinTimer); App._joinTimer = null; }
  setJoinBusy(false);
  setCreateBusy(false);
  $('#settle-overlay').classList.add('hidden');
  $('#chat-pop').classList.add('hidden');
  // Clean up Online session to prevent auto-reconnect after intentional leave
  // Use netClose() which closes the actual socket in net.js
  // Then invalidate to reject any stale callbacks from old socket
  if (wasOnline && typeof netSend === 'function') {
    // Intentional departure (vs transport loss): tell the server to free our
    // seat immediately instead of holding it through the reconnect grace.
    try { netSend({ type: 'LEAVE_ROOM' }); } catch (e) {}
  }
  if (typeof netClose === 'function') {
    if (wasOnline) {
      // Brief flush delay so LEAVE_ROOM reaches the server before the socket dies
      setTimeout(() => { try { netClose(); } catch (e) {} }, 150);
    } else {
      try { netClose(); } catch (e) {}
    }
  }
  if (typeof netInvalidate === 'function') {
    try { netInvalidate(); } catch (e) {}
  }
  if (typeof Online !== 'undefined' && Online) {
    Online.intentionalLeave = true; // flag to suppress reconnect
    Online.ws = null;
    Online.roomCode = null;
    Online.revisionRoom = null;
    Online.lastRevision = -1;
    Online.onlineScreen = 'HOME';
    // Clear token so new room doesn't reattach old seat via HELLO
    Online.token = null;
    try { localStorage.removeItem('gdy_token'); } catch (e) {}
    // Clear any pending reconnect timer
    if (Online._reconnectTimer) {
      clearTimeout(Online._reconnectTimer);
      Online._reconnectTimer = null;
    }
    // Increment generation so late callbacks from old connection are ignored
    Online._gen = (Online._gen || 0) + 1;
  }
  showScreen('screen-home');
}

/* ---------------- boot ---------------- */

function boot() {
  GdyViewport.init();
  try {
    const savedLang = localStorage.getItem('ddz_lang');
    if (savedLang) setLang(savedLang);
    const savedName = localStorage.getItem('ddz_name');
    if (savedName) $('#inp-name').value = savedName;
  } catch (e) { }
  applyStaticTexts();

  const toggleLang = () => {
    setLang(LANG === 'zh' ? 'en' : 'zh');
    applyStaticTexts();
    if (App.view) renderGame();
  };
  $('#btn-lang').onclick = toggleLang;
  $('#btn-lang2').onclick = toggleLang;

  const setSndBtns = () => {
    const label = Snd.enabled ? '🔊' : '🔇';
    $('#btn-snd').textContent = label;
    $('#btn-snd2').textContent = label;
  };
  setSndBtns();
  $('#btn-snd').onclick = () => { Snd.toggle(); setSndBtns(); };
  $('#btn-snd2').onclick = () => { Snd.toggle(); setSndBtns(); };

  const setBgmBtns = () => {
    $('#btn-bgm').classList.toggle('off', !Bgm.enabled);
    $('#btn-bgm2').classList.toggle('off', !Bgm.enabled);
  };
  setBgmBtns();
  $('#btn-bgm').onclick = () => { Bgm.toggle(); setBgmBtns(); };
  $('#btn-bgm2').onclick = () => { Bgm.toggle(); setBgmBtns(); };
  // Browsers only allow audio after a user gesture; arm on any click.
  document.addEventListener('pointerdown', () => { Snd.unlock(); Bgm.poke(); });

  bindHandDrag();
  window.addEventListener('resize', () => { if (App.view) layoutHand(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { Snd.unlock(); Bgm.poke(); }
  });
  // Help modal with proper dialog semantics, focus management, and Escape
  let _helpOpener = null;
  const openHelp = () => {
    const modal = $('#help-modal');
    _helpOpener = document.activeElement;
    modal.classList.remove('hidden');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    // Initial focus on close button
    const closeBtn = $('#btn-help-close');
    if (closeBtn) closeBtn.focus();
  };
  const closeHelp = () => {
    $('#help-modal').classList.add('hidden');
    // Return focus to opener
    if (_helpOpener && _helpOpener.focus) _helpOpener.focus();
  };
  $('#btn-help').onclick = openHelp;
  $('#btn-help2').onclick = openHelp;
  $('#btn-help-close').onclick = closeHelp;
  $('#help-modal').onclick = e => { if (e.target.id === 'help-modal') closeHelp(); };
  // Escape closes help, Tab is trapped within modal
  document.addEventListener('keydown', (e) => {
    const modal = $('#help-modal');
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeHelp();
      return;
    }
    if (e.key === 'Tab') {
      // Focus trap: keep focus within modal
      const focusable = modal.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  $('#btn-practice').onclick = startPractice;
  $('#btn-create').onclick = () => createRoom(0);
  $('#btn-join').onclick = joinRoom;
  $('#inp-code').onkeydown = e => { if (e.key === 'Enter') joinRoom(); };
  $('#btn-copy').onclick = () => {
    const code = App.code || '';
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast(t('copied')));
    else { prompt(t('r_code'), code); }
  };
  $('#btn-start').onclick = hostStartGame;
  $('#btn-leave-room').onclick = goHome;
  $('#btn-exit-game').onclick = confirmExit;
  $('#btn-chat').onclick = toggleChatPop;
}

document.addEventListener('DOMContentLoaded', boot);
