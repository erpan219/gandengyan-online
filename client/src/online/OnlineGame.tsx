import { useState } from 'react';
import { STRINGS } from '../i18n/strings';
import { Table } from '../ui/Table';
import { Hand } from '../ui/Hand';
import { QuickChat } from './QuickChat';
import type { PlayerView, CardId } from '../../../shared/types';
import type { ClientMsg, SeatInfo } from './protocol';

interface ChatMsg {
  from: string;
  fromName: string;
  text: string;
  ts: number;
}

export function OnlineGame(props: {
  lang: 'zh' | 'en';
  view: PlayerView;
  seats: SeatInfo[];
  hostId: string;
  chats: ChatMsg[];
  scores: Record<string, number>;
  send: (msg: ClientMsg) => void;
  onLeave: () => void;
}): JSX.Element {
  const t = STRINGS[props.lang];
  const [selected, setSelected] = useState<CardId[]>([]);
  const [sortAsc, setSortAsc] = useState(true);

  const myTurn = props.view.status === 'PLAYING' && props.view.currentPlayerId === props.view.selfId;
  const finished = props.view.status === 'FINISHED';
  const myPlace = props.view.players.find(p => p.id === props.view.selfId)?.place ?? null;

  const names: Record<string, string> = {};
  for (const s of props.seats) {
    names[s.playerId] = s.isBot ? `${t.bot}` : s.name;
  }

  const toggle = (id: CardId) =>
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);

  const doPlay = () => {
    if (!myTurn || selected.length === 0) return;
    props.send({
      type: 'PLAY_CARDS',
      cardIds: selected,
      expectedRevision: props.view.revision
    });
    setSelected([]);
  };

  const doPass = () => {
    if (!myTurn) return;
    props.send({ type: 'PASS', expectedRevision: props.view.revision });
    setSelected([]);
  };

  if (finished) {
    const ordered = [...props.view.finishOrder];
    const nameOf = (id: string) => id === props.view.selfId ? t.you : names[id] ?? id;

    return (
      <div className="gdy-screen gdy-results">
        <h2>{t.results}</h2>
        <div className="gdy-winner">
          🏆 {nameOf(ordered[0])} — {t.winner}
        </div>
        <ol className="gdy-places">
          {ordered.map((id, i) => (
            <li key={id} className={id === props.view.selfId ? 'me' : ''}>
              <span>{t.placeN(i + 1)}</span>
              <span>{nameOf(id)}</span>
              <span className="gdy-score">🏆 {props.scores[id] ?? 0}{t.points}</span>
            </li>
          ))}
        </ol>
        <div className="gdy-menu">
          {props.view.selfId === props.hostId ? (
            <button className="gdy-bigbtn" onClick={() => props.send({ type: 'START_GAME' })}>
              {t.rematch}
            </button>
          ) : (
            <div className="gdy-waiting">{t.waitingHost}</div>
          )}
          <button className="gdy-bigbtn ghost" onClick={props.onLeave}>
            {t.leaveRoom}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gdy-app">
      <div className="gdy-topbar">
        <span className="gdy-title">{t.appTitle}</span>
        <button className="gdy-lang" onClick={props.onLeave}>
          {t.leaveRoom}
        </button>
      </div>

      <Table view={props.view} lang={props.lang} botNames={names} />

      <div className="gdy-status">
        {myPlace != null ? (
          <span>{t.placeN(myPlace)}</span>
        ) : myTurn ? (
          <span className="gdy-myturn">{t.yourTurn}</span>
        ) : (
          <span>{t.waiting}…</span>
        )}
      </div>

      {myPlace == null && (
        <Hand
          cards={props.view.selfHand}
          selected={selected}
          onToggle={toggle}
          sortAsc={sortAsc}
        />
      )}

      <div className="gdy-controls">
        <button className="gdy-btn" onClick={() => setSortAsc(!sortAsc)}>
          {t.sort}
        </button>
        <button className="gdy-btn" onClick={doPass} disabled={!myTurn || myPlace != null || props.view.lastPlay === null}>
          {t.pass}
        </button>
        <button className="gdy-btn primary" onClick={doPlay} disabled={!myTurn || selected.length === 0 || myPlace != null}>
          {t.play}
        </button>
        <QuickChat lang={props.lang} chats={props.chats} send={props.send} />
      </div>
    </div>
  );
}
