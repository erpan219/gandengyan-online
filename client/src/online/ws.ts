import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, ServerMsg } from './protocol';

interface ChatMsg {
  from: string;
  fromName: string;
  text: string;
  ts: number;
}

interface WsState {
  connected: boolean;
  playerId: string | null;
  room: Extract<ServerMsg, { type: 'ROOM_STATE' }> | null;
  game: Extract<ServerMsg, { type: 'GAME_STATE' }> | null;
  error: string | null;
  chats: ChatMsg[];
}

/** WebSocket client for the Gandengyan multiplayer server. */
export function useGameServer() {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<WsState>({
    connected: false,
    playerId: null,
    room: null,
    game: null,
    error: null,
    chats: [],
  });

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true, error: null }));
      const token = localStorage.getItem('gdy-token');
      ws.send(JSON.stringify({ type: 'HELLO', token: token ?? undefined }));
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING' }));
        else clearInterval(ping);
      }, 25000);
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data) as ServerMsg;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'WELCOME':
          localStorage.setItem('gdy-token', msg.token);
          setState((s) => ({ ...s, playerId: msg.playerId }));
          break;
        case 'ROOM_STATE':
          setState((s) => ({ ...s, room: msg, error: null }));
          if (msg.phase === 'LOBBY') setState((s) => ({ ...s, game: null }));
          break;
        case 'GAME_STATE':
          setState((s) => ({ ...s, game: msg, error: null }));
          break;
        case 'CHAT_MSG':
          setState((s) => ({
            ...s,
            chats: [...s.chats.slice(-19), { from: msg.from, fromName: msg.fromName, text: msg.text, ts: Date.now() }],
          }));
          break;
        case 'ERROR':
          setState((s) => ({ ...s, error: `${msg.code}: ${msg.message}` }));
          break;
        case 'PONG':
          break;
      }
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      wsRef.current = null;
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setState({ connected: false, playerId: null, room: null, game: null, error: null, chats: [] });
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { ...state, send, connect, disconnect };
}
