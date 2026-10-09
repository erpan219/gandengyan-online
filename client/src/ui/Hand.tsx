import type { CardId } from '../../../shared/types';
import { rankStrength, cardIdToRank } from '../../../shared/deck';
import { CardView } from './CardView';

interface Props {
  cards: CardId[];
  selected: CardId[];
  onToggle: (id: CardId) => void;
  sortAsc: boolean;
}

/** Player's hand: horizontally scrollable overlapping fan, tap to select. */
export function Hand({ cards, selected, onToggle, sortAsc }: Props) {
  const sorted = [...cards].sort((a, b) => {
    const d = rankStrength(cardIdToRank(a)) - rankStrength(cardIdToRank(b));
    return sortAsc ? d : -d;
  });
  const sel = new Set(selected);
  return (
    <div className="gdy-hand" role="group" aria-label="hand">
      {sorted.map((id) => (
        <CardView
          key={id}
          id={id}
          selected={sel.has(id)}
          onClick={() => onToggle(id)}
        />
      ))}
    </div>
  );
}
