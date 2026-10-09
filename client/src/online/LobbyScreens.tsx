import { useState } from 'react';
import { STRINGS } from '../i18n/strings';
import type { ClientMsg } from './protocol';
import type { SeatInfo, RoomPhase } from './protocol';

type Lang = 'zh' | 'en';

export function ModeLobby(props: {
  lang: Lang;
  onLang: (lang: Lang) => void;
  onSolo: (n: 3 | 4) => void;
  onOnline: () => void;
  onRules: () => void;
}) {
  const t = STRINGS[props.lang] as unknown as Record<string, string>;

  return (
    <div className="gdy-screen gdy-start">
      <button
        type="button"
        className="gdy-lang"
        onClick={() => props.onLang(props.lang === 'zh' ? 'en' : 'zh')}
      >
        {props.lang === 'zh' ? 'EN' : '中文'}
      </button>

      <h1>{t.appTitle}</h1>

      <div className="gdy-menu">
        <button type="button" onClick={() => props.onSolo(3)}>
          {t.soloMode} · {t.players3}
        </button>

        <button type="button" onClick={() => props.onSolo(4)}>
          {t.soloMode} · {t.players4 || '4P'}
        </button>

        <button type="button" onClick={props.onOnline}>
          {t.onlineMode}
        </button>

        <button type="button" className="ghost" onClick={props.onRules}>
          {t.rules}
        </button>
      </div>
    </div>
  );
}

export function OnlineLobby(props: {
  lang: Lang;
  send: (msg: ClientMsg) => void;
  connected: boolean;
  onBack: () => void;
}) {
  const t = STRINGS[props.lang] as unknown as Record<string, string>;

  const [name, setName] = useState(localStorage.getItem('gdy-name') || '');
  const [playerCount, setPlayerCount] = useState<3 | 4>(3);
  const [fillBots, setFillBots] = useState(true);
  const [noShuffle, setNoShuffle] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  const saveName = () => {
    localStorage.setItem('gdy-name', name);
  };

  return (
    <div className="gdy-screen gdy-lobby">
      <button type="button" className="gdy-back" onClick={props.onBack}>
        {t.back}
      </button>

      <label htmlFor="gdy-name">{t.yourName}</label>
      <input
        id="gdy-name"
        className="gdy-input"
        value={name}
        placeholder={t.yourName}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="gdy-section gdy-create">
        <div className="gdy-player-count">
          {([3, 4] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={playerCount === n ? 'active' : ''}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <label className="gdy-toggle">
          <input
            type="checkbox"
            checked={fillBots}
            onChange={(e) => setFillBots(e.target.checked)}
          />
          {t.fillBots}
        </label>

        <label className="gdy-toggle">
          <input
            type="checkbox"
            checked={noShuffle}
            onChange={(e) => setNoShuffle(e.target.checked)}
          />
          {t.noShuffle} <span className="gdy-toggle-desc">{t.noShuffleDesc}</span>
        </label>

        <button
          type="button"
          disabled={!props.connected}
          onClick={() => {
            saveName();
            props.send({
              type: 'CREATE_ROOM',
              name,
              playerCount,
              fillWithBots: fillBots,
              noShuffle,
            });
          }}
        >
          {props.connected ? t.createRoom : t.connecting}
        </button>
      </div>

      <div className="gdy-section gdy-join">
        <input
          className="gdy-input"
          value={roomCode}
          placeholder={t.roomCode}
          style={{ textTransform: 'uppercase' }}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        />

        <button
          type="button"
          disabled={!props.connected}
          onClick={() => {
            saveName();
            props.send({
              type: 'JOIN_ROOM',
              roomCode,
              name,
            });
          }}
        >
          {props.connected ? t.joinRoom : t.connecting}
        </button>
      </div>
    </div>
  );
}

export function RoomView(props: {
  lang: Lang;
  playerId: string;
  roomCode: string;
  playerCount: number;
  seats: SeatInfo[];
  phase: RoomPhase;
  hostId: string;
  send: (msg: ClientMsg) => void;
  onLeave: () => void;
}) {
  const t = STRINGS[props.lang] as unknown as Record<string, string>;
  const [copied, setCopied] = useState(false);
  const phaseName = String(props.phase);
  const isHost = props.hostId === props.playerId;

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard?.writeText(props.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`gdy-screen gdy-lobby gdy-phase-${phaseName}`}>
      <div className="gdy-roomcode">
        <span>{props.roomCode}</span>
        <button type="button" onClick={copyRoomCode}>
          {copied ? t.copied : t.copyCode}
        </button>
      </div>

      <div className="gdy-room-meta">{props.playerCount}P</div>

      <div className="gdy-seats">
        {props.seats.map((seat, index) => {
          const s = seat;
          const seatId = String(s.playerId || '');
          const isEmpty = seatId.startsWith('empty:');
          const isSelf = seatId === props.playerId;
          const isSeatHost = props.hostId === seatId;

          return (
            <div
              key={`${seatId}-${index}`}
              className={`gdy-seat${isEmpty ? ' gdy-empty-seat' : ''}`}
            >
              <span className="gdy-seat-no">{index + 1}</span>

              {isEmpty ? (
                <span className="empty">…</span>
              ) : (
                <span className="gdy-seat-name">
                  {s.name || `Player ${index + 1}`}
                </span>
              )}

              {s.isBot && <span className="bot">{t.botShort}</span>}
              {s.ready && <span className="ready">✓</span>}
              {isSeatHost && <span className="host">👑</span>}

              {isSelf && (
                <button
                  type="button"
                  className="gdy-ready-btn"
                  onClick={() =>
                    props.send({
                      type: 'SET_READY',
                      ready: !s.ready,
                    })
                  }
                >
                  {s.ready ? t.notReady : t.ready}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isHost ? (
        <button
          type="button"
          onClick={() =>
            props.send({
              type: 'START_GAME',
            })
          }
        >
          {t.startGame}
        </button>
      ) : (
        <p className="gdy-waiting">{t.waitingHost}</p>
      )}

      <button type="button" className="gdy-leave" onClick={props.onLeave}>
        {t.leaveRoom}
      </button>
    </div>
  );
}
