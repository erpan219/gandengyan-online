'use strict';
/* net.js — WebSocket client for the Gandengyan game server.
   Replaces the PeerJS P2P networking with a client-server model.
   Server protocol: HELLO, CREATE_ROOM, JOIN_ROOM, SET_READY, START_GAME,
   PLAY_CARDS, PASS, CHAT, PING → WELCOME, ROOM_STATE, GAME_STATE, CHAT_MSG, ERROR, PONG
*/

const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

let ws = null;
let netHandlers = {};

function netConnect(handlers) {
  netHandlers = handlers || {};
  return new Promise((resolve, reject) => {
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      reject(e);
      return;
    }
    ws.onopen = () => {
      if (netHandlers.onOpen) netHandlers.onOpen();
      resolve();
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (netHandlers.onMessage) netHandlers.onMessage(msg);
      } catch (e) { /* ignore malformed */ }
    };
    ws.onclose = () => {
      if (netHandlers.onClose) netHandlers.onClose();
    };
    ws.onerror = () => {
      if (netHandlers.onError) netHandlers.onError();
      reject(new Error('ws-error'));
    };
  });
}

function netSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function netClose() {
  if (ws) { try { ws.close(); } catch (e) {} ws = null; }
}

function netAvailable() { return typeof WebSocket !== 'undefined'; }

/* Room code generation (client-side display only; server assigns actual code) */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/* Stub for compatibility with ui.js diagnostics (not implemented for WS) */
async function netDiagnose() {
  return { broker: true, stun: false, turn: false };
}
