import type { CardId } from '../../../shared/types';

interface Props {
  id: CardId;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
}

const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };
const RED = new Set(['H', 'D']);

function parse(id: CardId): { label: string; suit: string | null; red: boolean; joker: boolean } {
  if (id === 'SJ') return { label: '小王', suit: '★', red: false, joker: true };
  if (id === 'BJ') return { label: '大王', suit: '★', red: true, joker: true };
  const suit = id[0];
  const rank = id.slice(2);
  return { label: rank, suit: SUIT_SYMBOL[suit], red: RED.has(suit), joker: false };
}

export function CardView({ id, selected = false, onClick, small = false }: Props) {
  const { label, suit, red, joker } = parse(id);
  const cls = [
    'gdy-card',
    red ? 'red' : 'black',
    joker ? 'joker' : '',
    selected ? 'selected' : '',
    small ? 'small' : '',
  ].join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={id}>
      <span className="corner">
        <span className="rank">{label}</span>
        <span className="suit">{suit}</span>
      </span>
      <span className="pip">{suit}</span>
    </button>
  );
}
