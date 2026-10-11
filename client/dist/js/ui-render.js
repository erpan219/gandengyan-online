'use strict';
/* ui-render.js — HTML builders for the Gandengyan client (PR6).
 * Pure-ish render functions extracted from ui.js: they take the view (v)
 * and return HTML strings. Shared globals used: t (i18n), esc, App (read-only),
 * and small helpers (cardHTML, seatBadge, comboName, avatarForName,
 * thinkingDotsHTML). Loaded BEFORE ui.js. */
function cardHTML(c, cls, laizi, interactive) {
  cls = cls || '';
  if (!c) return `<div class="card back ${cls}"></div>`;
  const isJoker = c.r >= 16;
  const red = isJoker ? c.r === 17 : (c.s === 1 || c.s === 2);
  const lz = laizi && c.r === laizi ? ' lz' : '';
  const selected = cls.includes('sel');
  // Suit index: 0=Spades, 1=Hearts, 2=Diamonds, 3=Clubs
  const suitNames = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
  const label = isJoker ? (c.r === 17 ? 'Big Joker' : 'Small Joker') :
    `${RANK_LABELS[c.r]} of ${suitNames[c.s] || ''}`;
  // Only actionable hand cards get button semantics; played cards are descriptive
  const a11y = interactive
    ? ` role="button" tabindex="0" aria-pressed="${selected}" aria-label="${label}${selected ? ', selected' : ''}"`
    : ` aria-label="${label}"`;
  if (isJoker) {
    return `<div class="card jk ${red ? 'red' : ''} ${cls}${lz}" data-id="${c.id}"${a11y}>` +
      `<span class="jk-txt">JOKER</span><span class="cs">🃏</span></div>`;
  }
  return `<div class="card ${red ? 'red' : ''} ${cls}${lz}" data-id="${c.id}"${a11y}>` +
    `<span class="cr">${RANK_LABELS[c.r]}</span><span class="cs">${SUITS[c.s]}</span></div>`;
}

function seatBadge(v, p) {
  if (p.landlord) return `<span class="badge lord">👑 ${t('g_landlord')}</span>`;
  if (p.ally) return `<span class="badge ally">🤝 ${t('g_ally')}</span>`;
  return v.landlord != null ? `<span class="badge">${t('g_farmer')}</span>` : '';
}

/* Glanceable opponent panel: avatar, name, card-count ring, score, live
   turn timer, and a badge of the player's last play. */
function oppPanelHTML(v, seat) {
  const p = v.players[seat];
  const isTurn = v.actor === seat && (v.state === 'bidding' || v.state === 'doubling' || v.state === 'playing');
  const badge = seatBadge(v, p);
  const settleHand = p.hand && v.state === 'settle'
    ? `<div class="mini-cards reveal">${p.hand.map(c => cardHTML(c, 'mini', v.laizi)).join('')}</div>` : '';
  // Last-play badge: the dominant combo if this seat made it, else pass.
  let playBadge = '';
  if (v.trick && v.trick.seat === seat && v.trick.combo) {
    playBadge = `<span class="chip combo">${esc(comboName(v.trick.combo))}</span>`;
  } else if (p.lastPlay && p.lastPlay.pass) {
    playBadge = `<span class="chip dim">${esc(t('pass_txt'))}</span>`;
  }
  const turnChip = isTurn
    ? `<span class="chip timer" data-opp-timer>30</span>${thinkingDotsHTML()}` : '';
  return `<div class="opp ${isTurn ? 'turn' : ''}" data-seat="${seat}">
    <div class="opp-head">
      <span class="avatar">${p.isAI ? avatarForName(p.name) : '🧑'}</span>
      <div class="opp-names">
        <div class="pname">${esc(p.name)}${p.isAI ? ` <span class="tag">${t('ai_tag')}</span>` : ''} ${badge}</div>
        <div class="pmeta"><span class="card-count-ring" title="${esc(t('cards_left', p.cardCount))}">${p.cardCount}</span>
          <span class="pscore">${t('score_pts', p.score)}</span> ${turnChip}</div>
        ${playBadge ? `<div class="pplay">${playBadge}</div>` : ''}
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
  // Positional play display: each player's cards appear at the table edge
  // matching their seat. Only the dominant (winning) play is visible.
  const sides = seatSides(v);
  const trickSeat = v.trick ? v.trick.seat : null;
  // Animation keying: only animate NEW plays, re-renders stay still
  const fp = playFingerprint(trickSeat, v.trick ? v.trick.combo : null);
  const isNewPlay = fp && fp !== _lastPlayFingerprint;
  if (isNewPlay) _lastPlayFingerprint = fp;
  if (!v.trick || !v.trick.combo) { _lastPlayFingerprint = null; resetPassTracking(); }
  let html = '<div id="center-table">';

  // Helper: render cards or pass at a table position
  const spot = (seat, posClass) => {
    if (seat == null || !v.players[seat]) return '';
    const p = v.players[seat];
    const lp = p.lastPlay;
    let inner = '';
    // Show cards only if this seat made the dominant play
    if (seat === trickSeat && v.trick.combo && v.trick.combo.cards && v.trick.combo.cards.length) {
      const cards = v.trick.combo.cards.slice().sort((a, b) => b.r - a.r);
      const isBomb = v.trick.combo.kind && (v.trick.combo.kind.includes('BOMB') || v.trick.combo.kind === 'ROCKET');
      const animCls = isNewPlay ? '' : ' no-anim';
      inner = '<div class="table-cards' + (isBomb ? ' bomb-play' : '') + animCls + '">' +
              cards.map(c => cardHTML(c, '', v.laizi)).join('') + '</div>';
    } else if (lp && lp.pass) {
      // Pass fingerprint: only animate new passes
      const passFp = 'pass:' + seat;
      const isNewPass = passFp !== _lastPlayFingerprint;
      // Don't overwrite card fingerprint with pass, use separate tracking
      const passAnimCls = isNewPass && !_lastPassFingerprint[seat] ? '' : ' no-anim';
      _lastPassFingerprint[seat] = true;
      // Use localized text but same styling
      const passText = t('pass_txt');
      inner = '<div class="table-pass' + passAnimCls + '">' + passText + '</div>';
    }
    if (!inner) return '';
    return '<div class="table-spot ' + posClass + '">' + inner + '</div>';
  };

  html += spot(v.mySeat, 'ts-bottom');
  html += spot(sides.left, 'ts-left');
  html += spot(sides.right, 'ts-right');
  html += spot(sides.top, 'ts-top');

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
    // Auto-play mode: show cancel button prominently
    if (App.autoPlay) {
      return `<div class="autoplay-bar"><span class="autoplay-label">${t('autoplay_active')}</span>` +
        `<button class="act-btn primary" data-act="cancel-autoplay">${t('cancel_autoplay')}</button></div>`;
    }
    const prev = prevFor(v);
    const cdHtml = `<span id="turn-countdown" class="turn-countdown"></span>`;
    if (prev && !canBeat(v)) {
      return `${cdHtml}<button class="act-btn noplay" data-act="pass">${t('cant_beat')}</button>`;
    }
    const sel = v.myHand.filter(c => App.selected.has(c.id));
    let combo = null;
    let invalidReason = '';
    if (sel.length) {
      const cls = gdyClassify(sel.map(c => c.id), v.n || 3);
      if (cls.ok) {
        combo = {
          type: cls.combination.kind.toLowerCase().replace('_bomb', 'bomb'),
          rank: cls.combination.strength,
        };
        // Check if it beats prev
        if (prev && prev.cards) {
          const prevCombo = {
            kind: uiKindToGdy(prev.type),
            cardCount: prev.cards.length,
            strength: prev.rank,
          };
          if (!gdyCanBeat(cls.combination, prevCombo)) {
            combo = null;
            invalidReason = t('reason_no_beat') || 'Does not beat the previous play';
          }
        }
      } else {
        invalidReason = t('reason_invalid_combo') || 'Invalid combination';
      }
    }
    const preview = combo ? `<span class="combo-preview">${comboName(combo)}</span>` : '';
    const reasonHtml = invalidReason ? `<span class="invalid-reason" role="status">${invalidReason}</span>` : '';
    App._invalidReason = invalidReason;
    // Play button: fully enabled when the selection is legal. When cards are
    // selected but don't form a legal play, the button stays visible-but-dimmed
    // (aria-disabled, still tappable) so a tap can shake the hand and explain.
    const playBtn = combo
      ? `<button class="act-btn primary" data-act="play">${t('b_play')}</button>`
      : (sel.length
        ? `<button class="act-btn primary dimmed" data-act="play" data-invalid="1" aria-disabled="true">${t('b_play')}</button>`
        : `<button class="act-btn primary" data-act="play" disabled>${t('b_play')}</button>`);
    return `${cdHtml}${preview}${reasonHtml}<button class="act-btn" data-act="hint">${t('b_hint')}</button>` +
      `<button class="act-btn" data-act="pass" ${prev ? '' : 'disabled'}>${t('b_pass')}</button>` +
      playBtn;
  }
  return '';
}

/* Is there any legal answer to the current trick? Memoized per situation
   so re-renders (card clicks, bubbles) don't recompute move generation. */
function statusHTML(v) {
  if (v.actor == null) return '';
  const nm = v.players[v.actor].name;
  return `<span class="status">${t('thinking', esc(nm))}</span>`;
}


function thinkingDotsHTML() {
  return '<span class="thinking-dots"><span></span><span></span><span></span></span>';
}

