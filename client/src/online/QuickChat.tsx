import { useState } from 'react';
import { STRINGS } from '../i18n/strings';
import type { ClientMsg } from './protocol';

const PHRASES_ZH = ['快点！', '好牌！', '不要走', '合作愉快！', '干得漂亮！', '稍等一下', '再来一局！', '祝你好运！'];
const PHRASES_EN = ['Hurry up!', 'Nice play!', "Don't go!", 'Good teamwork!', 'Well done!', 'Just a moment', 'One more round!', 'Good luck!'];

interface ChatMsg {
  from: string;
  fromName: string;
  text: string;
  ts: number;
}

export function QuickChat(props: {
  lang: 'zh' | 'en';
  chats: ChatMsg[];
  send: (msg: ClientMsg) => void;
}): JSX.Element {
  const t = STRINGS[props.lang];
  const [open, setOpen] = useState(false);
  const phrases = props.lang === 'zh' ? PHRASES_ZH : PHRASES_EN;
  const recent = props.chats.slice(-3);

  return (
    <div className="gdy-chat">
      {recent.length > 0 && (
        <div className="gdy-chat-feed">
          {recent.map((c, i) => (
            <div key={`${c.ts}-${i}`} className="gdy-chat-msg">
              <span className="gdy-chat-from">{c.fromName}:</span> {c.text}
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="gdy-btn gdy-chat-btn"
        onClick={() => setOpen(!open)}
        aria-label="chat"
      >
        💬
      </button>
      {open && (
        <div className="gdy-chat-pop">
          {phrases.map((p) => (
            <button
              key={p}
              type="button"
              className="gdy-btn gdy-chat-phrase"
              onClick={() => {
                props.send({ type: 'CHAT', text: p });
                setOpen(false);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
