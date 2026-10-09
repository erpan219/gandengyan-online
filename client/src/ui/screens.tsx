import { STRINGS } from '../i18n/strings';
import type { PlayerView } from '../../../shared/types';

interface StartProps {
  lang: 'zh' | 'en';
  onLang: (l: 'zh' | 'en') => void;
  onStart: (n: 3 | 4) => void;
  onRules: () => void;
}

export function StartScreen({ lang, onLang, onStart, onRules }: StartProps) {
  const t = STRINGS[lang];
  return (
    <div className="gdy-screen gdy-start">
      <button className="gdy-lang" onClick={() => onLang(lang === 'zh' ? 'en' : 'zh')}>
        {t.langToggle}
      </button>
      <h1 className="gdy-title">{t.appTitle}</h1>
      <div className="gdy-menu">
        <button className="gdy-bigbtn" onClick={() => onStart(3)}>
          {t.players3}
        </button>
        <button className="gdy-bigbtn" onClick={() => onStart(4)}>
          {t.players4}
        </button>
        <button className="gdy-bigbtn ghost" onClick={onRules}>
          {t.rules}
        </button>
      </div>
    </div>
  );
}

export function RulesScreen({ lang, onBack }: { lang: 'zh' | 'en'; onBack: () => void }) {
  const t = STRINGS[lang];
  const zh = lang === 'zh';
  return (
    <div className="gdy-screen gdy-rules">
      <h2>{t.rules}</h2>
      <div className="gdy-rules-body">
        {zh ? (
          <ul>
            <li>3人局每人18张，4人局14/14/13/13，共54张牌。</li>
            <li>单牌从小到大：4 &lt; 5 &lt; … &lt; K &lt; A &lt; 2 &lt; 3 &lt; 小王 &lt; 大王。</li>
            <li>双王是最高的「火箭」；四张是四炸，三张是三炸。炸弹大于普通牌型：火箭 &gt; 四炸 &gt; 三炸。</li>
            <li>顺子只用4～A：3人局至少4张，4人局至少3张；连对至少两连对。</li>
            <li>没有三带、飞机、 full house 等其他牌型。</li>
            <li>首局持♠4者先出（首手可不出♠4）；之后由上一局第一名先出。</li>
            <li>回应时可过牌（即使能大过）；自由领出时不能过。</li>
            <li>第一个出完的人获胜，其余人继续比赛决出所有名次。</li>
          </ul>
        ) : (
          <ul>
            <li>3 players get 18 cards each; 4 players get 14/14/13/13. 54 cards total.</li>
            <li>Single rank order: 4 &lt; 5 &lt; … &lt; K &lt; A &lt; 2 &lt; 3 &lt; SJ &lt; BJ.</li>
            <li>Both Jokers = ROCKET (highest). Four of a kind = four-bomb, three = triple-bomb. Bombs beat ordinary hands: rocket &gt; four &gt; triple.</li>
            <li>Straights use only 4–A: min 4 cards (3P) / 3 cards (4P). Pair runs need ≥2 consecutive pairs.</li>
            <li>No kickers, full houses, or airplanes.</li>
            <li>First hand: holder of ♠4 leads (need not include it). Later hands: previous winner leads.</li>
            <li>You may pass a response even if you can beat it; no passing on a free lead.</li>
            <li>First finisher wins; the rest keep playing for all placements.</li>
          </ul>
        )}
      </div>
      <button className="gdy-bigbtn ghost" onClick={onBack}>
        {t.back}
      </button>
    </div>
  );
}

interface ResultsProps {
  lang: 'zh' | 'en';
  view: PlayerView;
  botNames: Record<string, string>;
  onRematch: () => void;
  onHome: () => void;
}

export function ResultsScreen({ lang, view, botNames, onRematch, onHome }: ResultsProps) {
  const t = STRINGS[lang];
  const ordered = [...view.finishOrder];
  const nameOf = (id: string) =>
    id === view.selfId ? t.you : botNames[id] ?? id;
  return (
    <div className="gdy-screen gdy-results">
      <h2>{t.results}</h2>
      <div className="gdy-winner">
        🏆 {nameOf(ordered[0])} — {t.winner}
      </div>
      <ol className="gdy-places">
        {ordered.map((id, i) => (
          <li key={id} className={id === view.selfId ? 'me' : ''}>
            <span>{t.placeN(i + 1)}</span>
            <span>{nameOf(id)}</span>
          </li>
        ))}
      </ol>
      <div className="gdy-menu">
        <button className="gdy-bigbtn" onClick={onRematch}>
          {t.rematch}
        </button>
        <button className="gdy-bigbtn ghost" onClick={onHome}>
          {t.appTitle}
        </button>
      </div>
    </div>
  );
}
