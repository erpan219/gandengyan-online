import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

declare global {
  interface Window {
    __GDY_PLAYTEST__?: {
      snapshot?: () => unknown | Promise<unknown>;
    };
  }
}

// Playtest bridge (inspired by OhMyGame's __OHMYGAME_PLAYTEST__ pattern):
// when ?playtest is present, expose a snapshot hook for automated verification.
if (new URLSearchParams(window.location.search).has('playtest')) {
  window.__GDY_PLAYTEST__ = {
    snapshot: () => ({
      url: window.location.href,
      title: document.title,
      rootText: document.getElementById('root')?.innerText?.slice(0, 500) ?? null,
      timestamp: Date.now(),
    }),
  };
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
