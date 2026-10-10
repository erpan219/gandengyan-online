'use strict';
/* online.js — WebSocket online multiplayer for Gandengyan.
   Adapts the server's PlayerView to the format ui.js renders.
   Server: our Node+ws backend. Client: his ui.js rendering.
*/

/* Convert server CardId ('S-4', 'SJ') to ui.js card object {id, r, s} */
function srvCardToUi(id) {
  const rankMap = { '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15, 'SJ': 16, 'BJ': 17 };
  const suitMap = { 'S': 0, 'H': 1, 'D': 2, 'C': 3 };
  let rank, suit;
  if (id === 'SJ' || id === 'BJ') {
    rank = rankMap[id];
    suit = -1;
  } else {
    rank = rankMap[id.slice(2)];
    suit = suitMap[id[0]];
  }
  return { id, r: rank, s: suit };
}

/* Convert server PlayerView to ui.js view format */
function srvViewToUi(srvView, seatMap, mySeatIdx, names) {
  // seatMap: server playerId -> seat index (0..n-1)
  // srvView: { selfId, selfHand, players, currentPlayerId, lastPlay, ... }

  const n = srvView.players.length;
  const myPlayerId = srvView.selfId;

  // Build players array in seat order
  const players = srvView.players.map((p, idx) => {
    const isMe = p.id === myPlayerId;
    return {
      name: names[p.id] || ('Player' + (idx + 1)),
      isAI: (srvView._botIds && srvView._botIds.has(p.id)) || false,
      cardCount: p.cardCount,
      landlord: false,
      ally: false,
      score: 0,
      wins: 0,
      lastPlay: null,  // filled below
      hand: undefined,
    };
  });

  // Map lastPlay
  let trick = { combo: null, seat: null };
  if (srvView.lastPlay) {
    const lp = srvView.lastPlay;
    const seatIdx = seatMap[lp.playerId];
    const cards = lp.combination.cardIds.map(srvCardToUi);
    if (seatIdx != null && players[seatIdx]) {
      players[seatIdx].lastPlay = { cards, pass: false };
    }
    trick = {
      combo: {
        type: lp.combination.kind.toLowerCase(),
        rank: lp.combination.strength,
        cards: cards,
      },
      seat: seatIdx,
    };
  }

  // Passed players show "pass"
  if (srvView.passedSinceLastPlay) {
    for (const pid of srvView.passedSinceLastPlay) {
      const idx = seatMap[pid];
      if (idx != null && players[idx]) {
        players[idx].lastPlay = { pass: true };
      }
    }
  }

  // Current turn
  const actor = srvView.currentPlayerId != null ? seatMap[srvView.currentPlayerId] : null;

  return {
    state: srvView.status === 'PLAYING' ? 'playing' : 'settle',
    mode: 'gdy',
    flags: { noShuffle: false },
    n: n,
    mySeat: mySeatIdx,
    roundNo: 1,
    actor: actor,
    trick: trick,
    liveMult: 1,
    players: players,
    myHand: srvView.selfHand.map(srvCardToUi).sort((a, b) => {
      const strength = { 4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6, 11: 7, 12: 8, 13: 9, 14: 10, 15: 11, 3: 12, 16: 13, 17: 14 };
      return (strength[a.r] - strength[b.r]) || (a.s - b.s);
    }),
    result: null,
  };
}

/* Online session manager */
const Online = {
  ws: null,
  roomCode: null,
  lastRevision: -1,  // For stale message rejection (architectural fix)
  revisionRoom: null, // Room code this revision belongs to (scope fix)
  onlineScreen: 'HOME', // Explicit screen state: HOME|LOBBY|PLAYING|RESULTS
  playerId: null,
  token: null,
  seatMap: {},      // playerId -> seat index
  names: {},        // playerId -> name
  mySeat: 0,
  revision: 0,

  connect() {
    return netConnect({
      onOpen: () => {
        netSend({ type: 'HELLO', token: this.token || undefined });
      },
      onMessage: (msg) => this.onMessage(msg),
      onClose: () => {
        // Don't reconnect after intentional leave
        if (this.intentionalLeave) {
          this.intentionalLeave = false; // reset for next session
          return;
        }
        toast(t('e_disconnect') || 'Disconnected');
        // Auto-reconnect with exponential backoff
        this._reconnectAttempts = (this._reconnectAttempts || 0) + 1;
        const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts - 1), 10000);
        toast(t('reconnecting') || 'Reconnecting...');
        setTimeout(() => {
          if (this.roomCode) {
            this.connect().then(() => {
              this._reconnectAttempts = 0;
              // Rejoin room with token
              netSend({ type: 'JOIN_ROOM', roomCode: this.roomCode, name: this.playerName || 'Player', token: this.token });
            }).catch(() => {
              // Will retry on next onClose
            });
          }
        }, delay);
      },
    });
  },

  onMessage(msg) {
    // Architectural fix: reject stale messages by revision, scoped to room session
    // Prevents out-of-order processing AND cross-room contamination
    if (typeof msg.revision === 'number') {
      const msgRoom = msg.roomCode || (msg.payload && msg.payload.roomCode) || this.roomCode;
      // New room session -> reset revision tracking
      if (msgRoom && msgRoom !== this.revisionRoom) {
        this.revisionRoom = msgRoom;
        this.lastRevision = -1;
      }
      if (msg.revision <= this.lastRevision) {
        return; // stale, ignore
      }
      this.lastRevision = msg.revision;
    }
    switch (msg.type) {
      case 'WELCOME':
        this.playerId = msg.playerId;
        this.token = msg.token;
        try { localStorage.setItem('gdy_token', msg.token); } catch (e) {}
        break;

      case 'ROOM_STATE':
        this.roomCode = msg.roomCode;
        // Build seat map
        this.seatMap = {};
        this.names = {};
        msg.seats.forEach((s, idx) => {
          this.seatMap[s.playerId] = idx;
          this.names[s.playerId] = s.name;
          if (s.playerId === this.playerId) this.mySeat = idx;
        });
        this.onRoomState(msg);
        break;

      case 'GAME_STATE':
        try {
          this.revision = msg.view.revision;
          // Rebuild seatMap from game state on every update.
          // The players array is in seatOrder, so index == seat.
          // Must rebuild (not just add missing) because stale mappings
          // cause wrong turn indicators when players finish.
          if (msg.view.players && Array.isArray(msg.view.players)) {
            const freshSeatMap = {};
            const seenIds = new Set();
            msg.view.players.forEach((p, idx) => {
              if (!p || !p.id || seenIds.has(p.id)) return; // skip nulls/dupes
              seenIds.add(p.id);
              freshSeatMap[p.id] = idx;
              if (!this.names[p.id]) this.names[p.id] = 'Player' + (idx + 1);
            });
            // Only replace if we got valid mappings
            if (Object.keys(freshSeatMap).length > 0) {
              this.seatMap = freshSeatMap;
              // Update mySeat only if our ID is present
              const myIdx = msg.view.players.findIndex(p => p && p.id === msg.view.selfId);
              if (myIdx >= 0) this.mySeat = myIdx;
            }
          }
          // Use server-provided bot IDs (not stale room state)
          const _botIds = new Set(msg.botIds || []);
          msg.view._botIds = _botIds;
          const view = srvViewToUi(msg.view, this.seatMap, this.mySeat, this.names);
          App.view = view;
          App.role = 'online';
          showScreen('screen-game');
          renderGame();
        } catch (e) {
          console.error('[GAME_STATE] Failed:', e);
          this.toast('Game start failed: ' + (e.message || e));
        }
        break;

      case 'CHAT_MSG':
        // Show as bubble
        if (msg.from && this.seatMap[msg.from] != null) {
          showBubble(this.seatMap[msg.from], msg.text);
        }
        break;

      case 'ERROR':
        toast(msg.message || 'Error');
        break;

      case 'PONG':
        break;
    }
  },

  onRoomState(msg) {
    // Update room screen with seats
    // This integrates with ui.js room screen
    if (typeof updateRoomScreenOnline === 'function') {
      updateRoomScreenOnline(msg);
    }
  },

  createRoom(name, playerCount, fillWithBots, noShuffle) {
    this.intentionalLeave = false; // new session, allow reconnect
    this.playerName = name;
    this.connect().then(() => {
      netSend({
        type: 'CREATE_ROOM',
        name: name,
        playerCount: playerCount,
        fillWithBots: fillWithBots,
        noShuffle: noShuffle,
      });
    }).catch(() => toast(t('e_net')));
  },

  joinRoom(code, name) {
    this.intentionalLeave = false; // new session, allow reconnect
    this.playerName = name;
    this.connect().then(() => {
      netSend({ type: 'JOIN_ROOM', roomCode: code, name: name });
    }).catch(() => toast(t('e_net')));
  },

  setReady(ready) {
    netSend({ type: 'SET_READY', ready: ready });
  },

  startGame() {
    if (!netSend({ type: 'START_GAME' })) {
      if (typeof toast === 'function') toast(t('e_disconnect') || 'Disconnected - please rejoin');
    }
  },

  playCards(cardIds) {
    netSend({ type: 'PLAY_CARDS', cardIds: cardIds, expectedRevision: this.revision });
  },

  pass() {
    netSend({ type: 'PASS', expectedRevision: this.revision });
  },

  chat(text) {
    netSend({ type: 'CHAT', text: text });
  },
};
