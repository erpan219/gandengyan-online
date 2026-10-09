import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CardId, GameState, PlayerId, PlayerView } from '../../shared/types';
import { createDeck, shuffle } from '../../shared/deck';
import { applyAction, getLegalMoves, getPlayerView, newHand } from '../../shared/engine';
import { classifyHand } from '../../shared/classify';
import { chooseBotMove } from '../../shared/bot';
import { STRINGS } from './i18n/strings';
import { Table } from './ui/Table';
import { Hand } from './ui/Hand';
import { RulesScreen, ResultsScreen } from './ui/screens';
import { ModeLobby, OnlineLobby, RoomView } from './online/LobbyScreens';
import { OnlineGame } from './online/OnlineGame';
import { useGameServer } from './online/ws';
import './ui/styles.css';

type Screen = 'mode' | 'rules' | 'solo' | 'online-lobby';

export default function App() {
  const [screen, setScreen] = useState<Screen>('mode');
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const online = useGameServer();

  // Auto-connect when entering online lobby
  useEffect(() => {
    if (screen === 'online-lobby') online.connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  if (screen === 'mode') {
    return (
      <ModeLobby
        lang={lang}
        onLang={setLang}
        onSolo={() => setScreen('solo')}
        onOnline={() => setScreen('online-lobby')}
        onRules={() => setScreen('rules')}
      />
    );
  }
  if (screen === 'rules') {
    return <RulesScreen lang={lang} onBack={() => setScreen('mode')} />;
  }
  if (screen === 'solo') {
    return <SoloGame lang={lang} onLang={setLang} onHome={() => setScreen('mode')} />;
  }
  // online-lobby
  if (online.room) {
    if (online.game && (online.room.phase === 'PLAYING' || online.room.phase === 'RESULTS')) {
      return (
        <OnlineGame
          lang={lang}
          view={online.game.view}
          seats={online.room.seats}
          hostId={online.room.hostId}
          chats={online.chats}
          scores={online.game.scores ?? {}}
          send={online.send}
          onLeave={() => {
            online.disconnect();
            setScreen('mode');
          }}
        />
      );
    }
    return (
      <RoomView
        lang={lang}
        playerId={online.playerId ?? ''}
        roomCode={online.room.roomCode}
        playerCount={online.room.playerCount}
        seats={online.room.seats}
        phase={online.room.phase}
        hostId={online.room.hostId}
        send={online.send}
        onLeave={() => {
          online.disconnect();
          setScreen('mode');
        }}
      />
    );
  }
  return (
    <OnlineLobby
      lang={lang}
      send={online.send}
      connected={online.connected}
      onBack={() => {
        online.disconnect();
        setScreen('mode');
      }}
    />
  );
}

/** Solo mode: human vs bots, adapted from the verified local game. */
function SoloGame({ lang, onLang, onHome }: { lang: 'zh' | 'en'; onLang: (l: 'zh' | 'en') => void; onHome: () => void }) {
  const [playerCount, setPlayerCount] = useState<3 | 4 | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<CardId[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [handNumber, setHandNumber] = useState(0);
  const [lastWinner, setLastWinner] = useState<PlayerId | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const actionSeq = useRef(0);
  const nextActionId = () => `a${++actionSeq.current}`;
  stateRef.current = state;

  const t = STRINGS[lang];

  const startHand = useCallback((n: 3 | 4, hn: number, winner: PlayerId | null) => {
    const ss: PlayerId[] = Array.from({ length: n }, (_, i) => (i === 0 ? 'you' : `bot${i}`));
    const deck = shuffle(createDeck().map((c) => c.id));
    let leader: PlayerId;
    if (winner && ss.includes(winner)) {
      leader = winner;
    } else {
      const hands: Record<string, CardId[]> = {};
      ss.forEach((s) => (hands[s] = []));
      deck.forEach((id, i) => hands[ss[i % ss.length]].push(id));
      leader = ss.find((s) => hands[s].includes('S-4')) ?? ss[0];
    }
    const s = newHand(ss, n, hn, leader, deck, ss.indexOf(leader));
    setState(s);
    setSelected([]);
    setError(null);
  }, []);

  const begin = (n: 3 | 4) => {
    setPlayerCount(n);
    setHandNumber(1);
    setLastWinner(null);
    startHand(n, 1, null);
  };

  useEffect(() => {
    if (!state || state.status !== 'PLAYING') return;
    const cur = state.currentPlayerId;
    if (!cur || cur === 'you') return;
    const timer = setTimeout(() => {
      const s = stateRef.current;
      if (!s || s.currentPlayerId !== cur || s.status !== 'PLAYING') return;
      const view = getPlayerView(s, cur);
      const mv = chooseBotMove(view, s.playerCount);
      const action =
        mv.type === 'PLAY'
          ? { type: 'PLAY' as const, actionId: nextActionId(), gameId: s.gameId, expectedRevision: s.revision, cardIds: mv.cardIds }
          : { type: 'PASS' as const, actionId: nextActionId(), gameId: s.gameId, expectedRevision: s.revision };
      const res = applyAction(s, action, { playerId: cur, source: 'BOT' as const });
      if (res.ok) {
        if (res.state.status === 'FINISHED') setLastWinner(res.state.finishOrder[0]);
        setState(res.state);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [state]);

  if (playerCount === null) {
    return (
      <div className="gdy-screen gdy-start">
        <button className="gdy-lang" onClick={() => onLang(lang === 'zh' ? 'en' : 'zh')}>
          {t.langToggle}
        </button>
        <h1 className="gdy-title">{t.appTitle}</h1>
        <div className="gdy-subtitle">{t.soloMode}</div>
        <div className="gdy-menu">
          <button className="gdy-bigbtn" onClick={() => begin(3)}>{t.players3}</button>
          <button className="gdy-bigbtn" onClick={() => begin(4)}>{t.players4}</button>
          <button className="gdy-bigbtn ghost" onClick={onHome}>{t.back}</button>
        </div>
      </div>
    );
  }

  const view: PlayerView | null = state ? getPlayerView(state, 'you') : null;
  if (!state || !view) return null;

  const botNames: Record<string, string> = {};
  view.players.forEach((p) => {
    if (p.id !== 'you') botNames[p.id] = `${t.bot}`;
  });

  if (state.status === 'FINISHED') {
    return (
      <ResultsScreen
        lang={lang}
        view={view}
        botNames={botNames}
        onRematch={() => {
          const hn = handNumber + 1;
          setHandNumber(hn);
          startHand(playerCount, hn, lastWinner);
        }}
        onHome={onHome}
      />
    );
  }

  const myTurn = state.currentPlayerId === 'you';
  const iAmDone = view.players.find((p) => p.id === 'you')?.place != null;

  const toggle = (id: CardId) => {
    setError(null);
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  };

  const doPlay = () => {
    if (!myTurn || selected.length === 0) return;
    const cls = classifyHand(selected, state.playerCount);
    if (!cls.ok) {
      setError(t.errMismatch);
      return;
    }
    const res = applyAction(
      state,
      { type: 'PLAY', actionId: nextActionId(), gameId: state.gameId, expectedRevision: state.revision, cardIds: selected },
      { playerId: 'you', source: 'HUMAN' as const },
    );
    if (!res.ok) {
      setError(res.code === 'DOES_NOT_BEAT' ? t.errTooSmall : t.errMismatch);
      return;
    }
    if (res.state.status === 'FINISHED') setLastWinner(res.state.finishOrder[0]);
    setSelected([]);
    setError(null);
    setState(res.state);
  };

  const doPass = () => {
    if (!myTurn || state.lastPlay === null) return;
    const res = applyAction(
      state,
      { type: 'PASS', actionId: nextActionId(), gameId: state.gameId, expectedRevision: state.revision },
      { playerId: 'you', source: 'HUMAN' as const },
    );
    if (!res.ok) {
      setError(t.errMismatch);
      return;
    }
    setSelected([]);
    setError(null);
    setState(res.state);
  };

  const doHint = () => {
    if (!myTurn) return;
    const moves = getLegalMoves(view, state.playerCount).sort(
      (a, b) => a.strength - b.strength || a.cardCount - b.cardCount,
    );
    if (moves.length === 0) {
      setError(t.errTooSmall);
      return;
    }
    setSelected([...moves[0].cardIds]);
    setError(null);
  };

  return (
    <div className="gdy-app">
      <div className="gdy-topbar">
        <span className="gdy-title">{t.appTitle}</span>
        <button className="gdy-lang" onClick={() => onLang(lang === 'zh' ? 'en' : 'zh')}>
          {t.langToggle}
        </button>
      </div>
      <Table view={view} lang={lang} botNames={botNames} />
      <div className="gdy-status">
        {iAmDone ? (
          <span>{t.placeN(view.players.find((p) => p.id === 'you')?.place ?? 0)}</span>
        ) : myTurn ? (
          <span className="gdy-myturn">{t.yourTurn}</span>
        ) : (
          <span>{t.waiting}…</span>
        )}
      </div>
      {!iAmDone && <Hand cards={view.selfHand} selected={selected} onToggle={toggle} sortAsc={sortAsc} />}
      {error && <div className="gdy-error">{error}</div>}
      <div className="gdy-controls">
        <button className="gdy-btn" onClick={() => setSortAsc(!sortAsc)}>{t.sort}</button>
        <button className="gdy-btn" onClick={doHint} disabled={!myTurn || iAmDone}>{t.hint}</button>
        <button className="gdy-btn" onClick={doPass} disabled={!myTurn || iAmDone || state.lastPlay === null}>{t.pass}</button>
        <button className="gdy-btn primary" onClick={doPlay} disabled={!myTurn || iAmDone}>{t.play}</button>
      </div>
    </div>
  );
}
