'use strict';
/* ui.js — screens, rendering and the host/guest glue.
   Roles: 'local' (practice, everything in-page), 'host' (runs the Game and
   pushes per-seat views to the guest), 'guest' (renders views, sends intents). */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const App = {
  role: null,
  name: '',
  cfg: null,
  game: null,
  peer: null,
  conns: {},        // host, in-game: seat -> DataConnection
  guests: [],       // host, lobby: [{conn, name}] in seat order (seat = idx + 1)
  guestConn: null,  // guest: connection to host
  code: null,
  started: false,
  view: null,
  selected: new Set(),
  bubbles: {},
};

/* ---------------- generic helpers ---------------- */

function showScreen(id) {
  $$('.screen').forEach(el => el.classList.toggle('active', el.id === id));
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

function cardHTML(c, cls, laizi) {
  cls = cls || '';
  if (!c) return `<div class="card back ${cls}"></div>`;
  const isJoker = c.r >= 16;
  const red = isJoker ? c.r === 17 : (c.s === 1 || c.s === 2);
  const lz = laizi && c.r === laizi ? ' lz' : '';
  if (isJoker) {
    return `<div class="card jk ${red ? 'red' : ''} ${cls}${lz}" data-id="${c.id}">` +
      `<span class="jk-txt">${c.r === 17 ? 'JOKER' : 'joker'}</span><span class="cs">🃏</span></div>`;
  }
  return `<div class="card ${red ? 'red' : ''} ${cls}${lz}" data-id="${c.id}">` +
    `<span class="cr">${RANK_LABELS[c.r]}</span><span class="cs">${SUITS[c.s]}</span></div>`;
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
  set('#t-mclassic', 'm_classic'); set('#t-mclassic-d', 'm_classic_d');
  set('#t-mduel', 'm_duel'); set('#t-mduel-d', 'm_duel_d');
  set('#t-mteam', 'm_team'); set('#t-mteam-d', 'm_team_d');
  set('#t-options', 'h_options');
  set('#t-olaizi', 'o_laizi'); set('#t-olaizi-d', 'o_laizi_d');
  set('#t-onoshuffle', 'o_noshuffle'); set('#t-onoshuffle-d', 'o_noshuffle_d');
  set('#t-odoubling', 'o_doubling'); set('#t-odoubling-d', 'o_doubling_d');
  set('#t-obase', 'o_base');
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
  for (const id of ['#btn-bgm', '#btn-bgm2']) $(id).title = t('tt_bgm');
  for (const id of ['#btn-snd', '#btn-snd2']) $(id).title = t('tt_snd');
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
    base: +$('#sel-base').value,
  };
}

function myName() {
  const v = $('#inp-name').value.trim();
  const name = v || ('Player' + Math.floor(Math.random() * 900 + 100));
  try { localStorage.setItem('ddz_name', name); } catch (e) { }
  return name;
}

/* ---------------- room (waiting) screen ---------------- */

function renderRoster(players) {
  const wrap = $('#room-players');
  wrap.innerHTML = players.map(p =>
    `<div class="roster-row"><span class="avatar">${p.ai ? '🤖' : '🧑'}</span>` +
    `<span>${esc(p.name)}</span>${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}</div>`).join('');
}

function seatsForMode(mode) { return mode === 'gdy4' ? 4 : 3; }
function roomCapacity() { return App.cfg ? seatsForMode(App.cfg.mode) : 3; }

function hostRosterPlayers() {
  const seats = [{ name: App.name, tag: t('r_host') }];
  for (const g of App.guests) seats.push({ name: g.name });
  while (seats.length < roomCapacity()) seats.push({ name: t('r_ai'), ai: true });
  return seats;
}

function updateRoomScreen() {
  $('#room-code').textContent = App.code || '';
  $('#room-status').textContent = App.guests.length >= roomCapacity() - 1 ? '' : t('r_waiting');
  renderRoster(hostRosterPlayers());
  $('#btn-start').style.display = App.role === 'host' ? '' : 'none';
}

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
      `<div class="roster-row"><span class="avatar">${s.isBot ? '🤖' : '🧑'}</span>` +
      `<span>${esc(s.name)}</span>` +
      `${s.playerId === msg.hostId ? `<span class="tag">${t('r_host')}</span>` : ''}` +
      `${s.ready ? '<span class="tag">✓</span>' : ''}</div>`).join('');
  }
  // Show start button for host, ready button for guests
  const isHost = msg.hostId && Online.playerId === msg.hostId;
  const btnStart = $('#btn-start');
  if (btnStart) btnStart.style.display = isHost ? '' : 'none';
  // Show the room screen
  showScreen('screen-room');
  setCreateBusy(false);
  if (typeof setJoinBusy === 'function') setJoinBusy(false);
}

function sendRoomInfo() {
  const players = hostRosterPlayers().map(p => ({ name: p.name, ai: !!p.ai, tag: p.tag || '' }));
  for (const g of App.guests) {
    if (g.conn) try { g.conn.send({ t: 'room', code: App.code, players }); } catch (e) { }
  }
}

/* ---------------- liveness (heartbeat) ----------------
   WebRTC close events are unreliable when a tab is killed or a phone is
   locked, so both sides ping every 5s; 40s of silence means gone. */

const HEARTBEAT_MS = 5000;
const PEER_TIMEOUT_MS = 40000;

function startHeartbeat() {
  stopHeartbeat();
  App._hb = setInterval(() => {
    const now = Date.now();
    if (App.role === 'host') {
      for (const g of App.guests.slice()) {
        if (!g.conn) continue;
        try { g.conn.send({ t: 'ping' }); } catch (e) { }
        if (g.lastSeen && now - g.lastSeen > PEER_TIMEOUT_MS) {
          const conn = g.conn;
          try { conn.close(); } catch (e) { }
          hostOnGuestGone(conn);
        }
      }
    } else if (App.role === 'guest' && App.guestConn) {
      try { App.guestConn.send({ t: 'ping' }); } catch (e) { }
      if (App._hostSeen && now - App._hostSeen > PEER_TIMEOUT_MS) {
        toast(t('e_hostleft'));
        goHome();
      }
    }
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (App._hb) { clearInterval(App._hb); App._hb = null; }
}

function sendBye() {
  try {
    if (App.role === 'guest' && App.guestConn) App.guestConn.send({ t: 'bye' });
    if (App.role === 'host') for (const g of App.guests) { if (g.conn) g.conn.send({ t: 'bye' }); }
  } catch (e) { }
}

/* ---------------- host / local game plumbing ---------------- */

function sendAll(msg) {
  for (const conn of Object.values(App.conns)) { try { conn.send(msg); } catch (e) { } }
}

function pushViews() {
  const g = App.game;
  if (!g) return;
  for (const [seat, conn] of Object.entries(App.conns)) {
    try { conn.send({ t: 'view', v: g.buildView(+seat) }); } catch (e) { }
  }
  App.view = g.buildView(0);
  renderGame();
}

function newGame(players) {
  App.game = new Game(Object.assign({}, App.cfg, { players, playerCount: seatsForMode(App.cfg.mode) }), {
    onUpdate: () => pushViews(),
    onEvent: (ev) => {
      if (ev === 'redeal') { toast(t('e_redeal')); sendAll({ t: 'toastc', code: 'e_redeal' }); }
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
  while (players.length < total) players.push({ name: 'AI ' + players.length, isAI: true });
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

function seatOfConn(conn) {
  const idx = App.guests.findIndex(g => g.conn === conn);
  return idx < 0 ? -1 : idx + 1;
}

function hostAcceptConn(conn) {
  if (App.started || App.guests.length >= roomCapacity() - 1) {
    try { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 200); } catch (e) { }
    return;
  }
  conn.on('data', d => hostOnData(conn, d));
  conn.on('close', () => hostOnGuestGone(conn));
}

function hostOnData(conn, d) {
  if (!d || typeof d !== 'object') return;
  const known = App.guests.find(g => g.conn === conn);
  if (known) known.lastSeen = Date.now();
  if (d.t === 'ping') return;
  if (d.t === 'bye') { if (known) { try { conn.close(); } catch (e) { } hostOnGuestGone(conn); } return; }
  if (d.t === 'hello') {
    if (seatOfConn(conn) >= 0) return;
    if (App.started || App.guests.length >= roomCapacity() - 1) {
      try { conn.send({ t: 'full' }); } catch (e) { }
      return;
    }
    App.guests.push({ conn, name: String(d.name || 'Guest').slice(0, 12), lastSeen: Date.now() });
    updateRoomScreen();
    sendRoomInfo();
    return;
  }
  if (d.t === 'act' && App.started) {
    const seat = seatOfConn(conn);
    if (seat < 0) return;
    dispatchAct(seat, d.kind, d.data, () => { try { conn.send({ t: 'err', code: 'e_invalid' }); } catch (e) { } });
  }
}

function hostOnGuestGone(conn) {
  const idx = App.guests.findIndex(g => g.conn === conn);
  if (idx < 0) return;
  if (App.started && App.game && App.game.state !== 'idle') {
    // Keep the seat (order defines seats); let an AI take over.
    const seat = idx + 1;
    App.guests[idx].conn = null;
    delete App.conns[seat];
    const nm = App.game.players[seat].name;
    App.game.players[seat].isAI = true;
    toast(t('e_disconnected', nm));
    sendAll({ t: 'toastc', code: 'e_disconnected', arg: nm });
    App.game.pump();
    pushViews();
  } else {
    const nm = App.guests[idx].name;
    App.guests.splice(idx, 1);
    toast(t('e_left', nm));
    updateRoomScreen();
    sendRoomInfo();
  }
}

function hostStartGame() {
  if (App.role === 'online') {
    Online.startGame();
    return;
  }
  const players = [{ name: App.name }];
  for (const g of App.guests) players.push({ name: g.name });
  while (players.length < roomCapacity()) players.push({ name: 'AI ' + players.length, isAI: true });
  App.conns = {};
  App.guests.forEach((g, i) => { if (g.conn) App.conns[i + 1] = g.conn; });
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
  else if (kind === 'chat') hostChat(seat, data.id | 0);
  if (!ok && onErr) onErr();
}

function hostChat(seat, id) {
  sendAll({ t: 'chat', seat, id });
  showBubble(seat, t('chat')[id] || '');
}

/* ---------------- guest plumbing ---------------- */

function setJoinBusy(busy) {
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
  if (code.length !== 4) { toast(t('e_room404')); return; }
  App.name = myName();
  App.role = 'online';
  App.code = code;
  setJoinBusy(true);
  try { Online.token = localStorage.getItem('gdy_token') || null; } catch (e) {}
  Online.joinRoom(code, App.name);
}

/* ---------------- network diagnostics ---------------- */


function guestOnData(d) {
  if (!d || typeof d !== 'object') return;
  App._hostSeen = Date.now();
  if (d.t === 'ping') return;
  if (d.t === 'bye') { toast(t('e_hostleft')); goHome(); return; }
  if (d.t === 'room') {
    $('#room-status').textContent = '';
    renderRoster(d.players || []);
  } else if (d.t === 'view') {
    App.started = true;
    App.view = d.v;
    if (!$('#screen-game').classList.contains('active')) showScreen('screen-game');
    renderGame();
  } else if (d.t === 'chat') {
    if (d.seat !== App.view?.mySeat) showBubble(d.seat, t('chat')[d.id] || '');
  } else if (d.t === 'err' || d.t === 'toastc') {
    toast(t(d.code || 'e_invalid', d.arg !== undefined ? d.arg : ''));
  } else if (d.t === 'full') {
    toast(t('e_full'));
    goHome();
  }
}

/* ---------------- shared action entry ---------------- */

function act(kind, data) {
  if (App.role === 'online') {
    data = data || {};
    if (kind === 'play') Online.playCards(Array.isArray(data.ids) ? data.ids : []);
    else if (kind === 'pass') Online.pass();
    else if (kind === 'chat') {
      const txt = (t('chat') && t('chat')[data.id]) || '';
      if (txt) Online.chat(txt);
      showBubble(App.view ? App.view.mySeat : 0, txt);
    }
    return;
  }
  if (App.role === 'guest') {
    if (App.guestConn) App.guestConn.send({ t: 'act', kind, data });
    if (kind === 'chat') showBubble(App.view ? App.view.mySeat : 1, t('chat')[data.id] || '');
    return;
  }
  if (kind === 'chat' && App.role === 'local') { showBubble(0, t('chat')[data.id] || ''); return; }
  dispatchAct(0, kind, data, () => toast(t('e_invalid')));
}

/* ---------------- game rendering ---------------- */

function seatSides(v) {
  // My seat at the bottom; play order flows to the right.
  if (v.n === 2) return { left: null, right: null, top: (v.mySeat + 1) % 2 };
  if (v.n === 4) return { left: (v.mySeat + 3) % 4, right: (v.mySeat + 1) % 4, top: (v.mySeat + 2) % 4 };
  return { left: (v.mySeat + 2) % 3, right: (v.mySeat + 1) % 3, top: null };
}

function playAreaHTML(v, seat) {
  const p = v.players[seat];
  if (v.state === 'bidding') {
    if (p.bid === null || p.bid === undefined) return '';
    return `<span class="say">${p.bid === 0 ? t('bid0') : t('bidN', p.bid)}</span>`;
  }
  if (v.state === 'doubling') {
    if (p.dbl === null || p.dbl === undefined) return '';
    return `<span class="say">${p.dbl ? t('dblY') : t('dblN')}</span>`;
  }
  const lp = p.lastPlay;
  if (!lp) return '';
  if (lp.pass) return `<span class="say pass">${t('pass_txt')}</span>`;
  const cards = lp.cards.slice().sort((a, b) => b.r - a.r);
  return `<div class="mini-cards">${cards.map(c => cardHTML(c, 'mini', v.laizi)).join('')}</div>` +
    `<span class="combo-tag">${comboName(lp.combo)}</span>`;
}

function seatBadge(v, p) {
  if (p.landlord) return `<span class="badge lord">👑 ${t('g_landlord')}</span>`;
  if (p.ally) return `<span class="badge ally">🤝 ${t('g_ally')}</span>`;
  return v.landlord != null ? `<span class="badge">${t('g_farmer')}</span>` : '';
}

function oppPanelHTML(v, seat) {
  const p = v.players[seat];
  const isTurn = v.actor === seat && (v.state === 'bidding' || v.state === 'doubling' || v.state === 'playing');
  const badge = seatBadge(v, p);
  const settleHand = p.hand && v.state === 'settle'
    ? `<div class="mini-cards reveal">${p.hand.map(c => cardHTML(c, 'mini', v.laizi)).join('')}</div>` : '';
  return `<div class="opp ${isTurn ? 'turn' : ''}" data-seat="${seat}">
    <div class="opp-head">
      <span class="avatar">${p.isAI ? '🤖' : '🧑'}</span>
      <div class="opp-names">
        <div class="pname">${esc(p.name)}${p.isAI ? ` <span class="tag">${t('ai_tag')}</span>` : ''} ${badge}</div>
        <div class="pmeta">${t('score_pts', p.score)} · ${t('cards_left', p.cardCount)}</div>
      </div>
    </div>
    ${settleHand}
    <div class="bubble-slot"></div>
  </div>`;
}

function centerHTML(v) {
  const chips = [];
  chips.push(`<span class="chip">${t('g_round', v.roundNo)}</span>`);
  if (v.laizi) chips.push(`<span class="chip lzchip">${t('g_laizi')}: ${rankLabel(v.laizi)}</span>`);
  chips.push(`<span class="chip">${t('g_mult')} ×${v.liveMult}</span>`);
  if (v.flags.noShuffle) chips.push(`<span class="chip">${t('o_noshuffle')}</span>`);
  if (v.mode === 'duel') chips.push(`<span class="chip dim" title="${t('g_dead')}">🂠×17</span>`);
  return chips.join('');
}

function midHTML(v) {
  // Central play area: each player's last play positioned by seat, like pro clients.
  // Bottom = me, left/right = opponents. Large cards, clearly visible.
  const sides = seatSides(v);
  let html = '<div id="center-table">';

  // Helper to render a play (cards or pass) for a seat
  const playFor = (seat, posClass) => {
    if (seat == null || !v.players[seat]) return '';
    const p = v.players[seat];
    const lp = p.lastPlay;
    let inner = '';
    if (lp) {
      if (lp.pass) {
        inner = `<div class="play-pass">不出</div>`;
      } else if (lp.cards && lp.cards.length) {
        const cards = lp.cards.slice().sort((a, b) => b.r - a.r);
        inner = `<div class="play-cards">${cards.map(c => cardHTML(c, '', v.laizi)).join('')}</div>`;
      }
    }
    return `<div class="play-spot ${posClass}">${inner}</div>`;
  };

  // Position plays: me at bottom, opponents left/right
  html += playFor(v.mySeat, 'pos-bottom');
  if (sides.left != null) html += playFor(sides.left, 'pos-left');
  if (sides.right != null) html += playFor(sides.right, 'pos-right');
  if (sides.top != null) html += playFor(sides.top, 'pos-top');

  html += '</div>';
  return html;
}

function myInfoHTML(v) {
  const p = v.players[v.mySeat];
  const badge = seatBadge(v, p);
  return `<span class="avatar">🧑</span><span class="pname">${esc(p.name)}</span> ${badge}
    <span class="pmeta">${t('score_pts', p.score)}</span><div class="bubble-slot"></div>`;
}

function actionsHTML(v) {
  const mine = v.actor === v.mySeat;
  if (v.state === 'bidding') {
    if (!mine) return statusHTML(v);
    let btns = `<button class="act-btn" data-bid="0">${t('bid0')}</button>`;
    for (let b = 1; b <= 3; b++)
      btns += `<button class="act-btn primary" data-bid="${b}" ${b <= v.currentBid ? 'disabled' : ''}>${t('bidN', b)}</button>`;
    return btns;
  }
  if (v.state === 'doubling') {
    if (!mine) return statusHTML(v);
    return `<button class="act-btn" data-dbl="0">${t('dblN')}</button>` +
      `<button class="act-btn primary" data-dbl="1">${t('dblY')}</button>`;
  }
  if (v.state === 'playing') {
    if (!mine) return statusHTML(v);
    const prev = prevFor(v);
    if (prev && !canBeat(v)) {
      return `<button class="act-btn noplay" data-act="pass">${t('cant_beat')}</button>`;
    }
    const sel = v.myHand.filter(c => App.selected.has(c.id));
    let combo = null;
    if (sel.length) {
      const cls = gdyClassify(sel.map(c => c.id), v.n || 3);
      if (cls.ok) {
        combo = {
          type: cls.combination.kind.toLowerCase().replace('_bomb', 'bomb'),
          rank: cls.combination.strength,
        };
        // Check if it beats prev
        if (prev && prev.cards) {
          const kindMap = { 'single': 'SINGLE', 'pair': 'PAIR', 'straight': 'STRAIGHT', 'pair_run': 'PAIR_RUN', 'triplebomb': 'TRIPLE_BOMB', 'fourbomb': 'FOUR_BOMB', 'rocket': 'ROCKET' };
          const prevCombo = {
            kind: kindMap[prev.type] || 'SINGLE',
            cardCount: prev.cards.length,
            strength: prev.rank,
          };
          if (!gdyCanBeat(cls.combination, prevCombo)) combo = null;
        }
      }
    }
    const preview = combo ? `<span class="combo-preview">${comboName(combo)}</span>` : '';
    return `${preview}<button class="act-btn" data-act="hint">${t('b_hint')}</button>` +
      `<button class="act-btn" data-act="pass" ${prev ? '' : 'disabled'}>${t('b_pass')}</button>` +
      `<button class="act-btn primary" data-act="play" ${combo ? '' : 'disabled'}>${t('b_play')}</button>`;
  }
  return '';
}

/* Is there any legal answer to the current trick? Memoized per situation
   so re-renders (card clicks, bubbles) don't recompute move generation. */
function canBeat(v) {
  const c = v.trick.combo;
  if (!c || !c.cards) return true;  // No trick to beat, or invalid
  // Check if player has any card that can beat
  const handIds = v.myHand.map(card => card.id);
  const kindMap = { 'single': 'SINGLE', 'pair': 'PAIR', 'straight': 'STRAIGHT', 'pair_run': 'PAIR_RUN', 'triplebomb': 'TRIPLE_BOMB', 'fourbomb': 'FOUR_BOMB', 'rocket': 'ROCKET' };
  const prevCombo = {
    kind: kindMap[c.type] || 'SINGLE',
    cardCount: c.cards.length,
    strength: c.rank,
  };
  const plays = gdyFindPlays(handIds, prevCombo, v.n || 3);
  return plays.length > 0;
}

function statusHTML(v) {
  if (v.actor == null) return '';
  const nm = v.players[v.actor].name;
  return `<span class="status">${t('thinking', esc(nm))}</span>`;
}

/* Sound effects are driven by diffing consecutive views, so they fire
   identically for local play, host and guest. */
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
    if (c && c.type === 'rocket') Snd.rocket();
    else if (c && c.type === 'bomb') Snd.bomb();
    else Snd.play();
  }
  if (cur.bids !== prev.bids) Snd.bid();
  if (cur.dbls !== prev.dbls) Snd.dbl();
  if (v.state === 'settle' && prev.state !== 'settle' && v.result) {
    const r = v.result;
    const iWon = r.landlordWon ? v.mySeat === v.landlord : v.mySeat !== v.landlord;
    if (iWon) Snd.win(); else Snd.lose();
    return;
  }
  if (v.state === 'playing' && cur.actor === v.mySeat && prev.actor !== v.mySeat) Snd.turn();
}

function renderGame() {
  const v = App.view;
  if (!v) return;
  playSounds(v);
  // prune stale selection
  const handIds = new Set(v.myHand.map(c => c.id));
  for (const id of [...App.selected]) if (!handIds.has(id)) App.selected.delete(id);

  $('#center-info').innerHTML = centerHTML(v);
  const sides = seatSides(v);
  $('#opp-left').innerHTML = sides.left !== null ? oppPanelHTML(v, sides.left) : '';
  $('#opp-right').innerHTML = sides.right !== null ? oppPanelHTML(v, sides.right) : '';
  $('#table-mid').innerHTML = midHTML(v);

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
    cardHTML(c, App.selected.has(c.id) ? 'sel' : '', v.laizi)).join('');
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

function bindActionButtons() {
  $$('#actions [data-bid]').forEach(b => b.onclick = () => act('bid', { v: +b.dataset.bid }));
  $$('#actions [data-dbl]').forEach(b => b.onclick = () => act('double', { yes: +b.dataset.dbl === 1 }));
  const hint = $('#actions [data-act=hint]');
  if (hint) hint.onclick = doHint;
  const pass = $('#actions [data-act=pass]');
  if (pass) pass.onclick = () => { App.selected.clear(); act('pass'); };
  const play = $('#actions [data-act=play]');
  if (play) play.onclick = () => act('play', { ids: [...App.selected] });
}

/* Drag across the hand to (de)select a run of cards; a plain tap still
   toggles one card. Bound once in boot() — the hand element persists. */
function bindHandDrag() {
  const handEl = $('#my-hand');
  let drag = null;
  const cardIdAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest('#my-hand .card');
    return c ? c.dataset.id : null;
  };
  const applySel = (id, on) => {
    if (on) App.selected.add(id); else App.selected.delete(id);
    Snd.tick();
    renderGame();
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
  let step = cw - (window.innerWidth <= 720 ? 22 : 30);
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
    const kindMap = { 'single': 'SINGLE', 'pair': 'PAIR', 'straight': 'STRAIGHT', 'pair_run': 'PAIR_RUN', 'triplebomb': 'TRIPLE_BOMB', 'fourbomb': 'FOUR_BOMB', 'rocket': 'ROCKET' };
    prev = {
      kind: kindMap[p.type] || 'SINGLE',
      cardCount: p.cards.length,
      strength: p.rank,
      cardIds: p.cards.map(c => c.id),
    };
  }
  const n = v.n || 3;
  const play = gdyHint(handIds, prev, n);
  if (!play || !play.length) { if (prev) { App.selected.clear(); act('pass'); } return; }
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
  const rows = r.finishOrder.map((seat, idx) => {
    const p = v.players[seat];
    const pts = r.roundScores ? r.roundScores[seat] : 0;
    return `<div class="settle-row ${seat === v.mySeat ? 'me' : ''}">
      <span>${placeNames[idx] || ''} ${esc(p.name)}</span>
      <span class="${pts > 0 ? 'plus' : ''}">+${pts}</span>
      <span class="total">${t('score_pts', p.score)}</span></div>`;
  }).join('');
  $('#settle-overlay').innerHTML = `<div class="settle-box ${iWon ? 'won' : 'lost'}">
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
  sendBye();
  stopHeartbeat();
  App._netSession = (App._netSession || 0) + 1;
  App._hostSeen = null;
  if (App.game) { App.game.stop(); App.game = null; }
  if (App.peer) {
    // Let the bye message flush before tearing the connection down.
    const peer = App.peer;
    App.peer = null;
    setTimeout(() => { try { peer.destroy(); } catch (e) { } }, 300);
  }
  App.role = null;
  App.conns = {};
  App.guests = [];
  App.guestConn = null;
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
  showScreen('screen-home');
}

/* ---------------- boot ---------------- */

function boot() {
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
    if (App.role === 'host' && $('#screen-room').classList.contains('active')) updateRoomScreen();
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
  const openHelp = () => $('#help-modal').classList.remove('hidden');
  $('#btn-help').onclick = openHelp;
  $('#btn-help2').onclick = openHelp;
  $('#btn-help-close').onclick = () => $('#help-modal').classList.add('hidden');
  $('#help-modal').onclick = e => { if (e.target.id === 'help-modal') $('#help-modal').classList.add('hidden'); };

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

  const farewell = () => {
    sendBye();
    if (App.peer) try { App.peer.destroy(); } catch (e) { }
  };
  window.addEventListener('beforeunload', farewell);
  window.addEventListener('pagehide', farewell);
}

document.addEventListener('DOMContentLoaded', boot);
