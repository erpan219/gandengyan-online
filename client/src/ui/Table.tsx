import type { PlayerView } from '../../../shared/types';
import { STRINGS } from '../i18n/strings';
import { CardView } from './CardView';

interface Props {
  view: PlayerView;
  lang: 'zh' | 'en';
  botNames: Record<string, string>;
}

/** Opponent seats + center last-play area. Pure presentational. */
export function Table({ view, lang, botNames }: Props) {
  const t = STRINGS[lang];
  const opponents = view.players.filter((p) => p.id !== view.selfId);
  return (
    <div className="gdy-table">
      <div className="gdy-opponents">
        {opponents.map((p) => {
          const isTurn = view.currentPlayerId === p.id;
          const passed = view.passedSinceLastPlay.includes(p.id);
          return (
            <div key={p.id} className={`gdy-opp${isTurn ? ' turn' : ''}${p.place ? ' done' : ''}`}>
              <div className="gdy-opp-name">
                {botNames[p.id] ?? p.id}
                {p.place ? <span className="gdy-place">{t.placeN(p.place)}</span> : null}
              </div>
              <div className="gdy-opp-info">
                {p.place ? null : (
                  <span className="gdy-count">
                    {p.cardCount}
                    {t.cardsLeft}
                  </span>
                )}
                {passed && <span className="gdy-passed">{t.passed}</span>}
                {isTurn && !p.place && <span className="gdy-thinking">…</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="gdy-center">
        {view.lastPlay ? (
          <>
            <div className="gdy-lastplay-label">{t.lastPlay}</div>
            <div className="gdy-lastplay">
              {view.lastPlay.combination.cardIds.map((id) => (
                <CardView key={id} id={id} small />
              ))}
            </div>
          </>
        ) : (
          <div className="gdy-freelead">{t.freeLead}</div>
        )}
      </div>
    </div>
  );
}
