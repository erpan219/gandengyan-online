'use strict';

/* A phone-sized landscape surface, including dialogs and notifications.
 * Orientation locking is unavailable in many mobile webviews (notably iOS).
 * Rotate the surface while the device is portrait instead; native DOM hit
 * testing still maps touch/drag coordinates correctly through the transform.
 * On tablets, desktop, and the lobby this shell has no layout box at all. */
const GdyViewport = (() => {
  let shell;
  let pending = 0;
  const coarse = window.matchMedia('(pointer: coarse)');

  function fitPlays() {
    if (!shell) return;
    if (!shell.classList.contains('phone-game')) {
      shell.querySelectorAll('.table-cards .card').forEach(card => card.style.removeProperty('margin-left'));
      return;
    }
    const center = document.getElementById('center-table');
    if (!center) return;
    const available = Math.max(0, center.clientWidth - 16);
    center.querySelectorAll('.table-cards:not(.leaving)').forEach(fan => {
      const cards = fan.children;
      if (cards.length < 2) return;
      const width = cards[0].offsetWidth;
      // Leave the complete two-digit "10" index exposed whenever space allows.
      const step = Math.min(Math.max(26, width - 20), (available - width) / (cards.length - 1));
      for (let i = 1; i < cards.length; i++) cards[i].style.marginLeft = `${step - width}px`;
    });
  }

  function sync() {
    if (!shell) return;
    const viewport = window.visualViewport;
    // Layout viewport dimensions determine device class. A software keyboard
    // or browser toolbar must not turn a tablet into a phone mid-session.
    const phone = coarse.matches && Math.min(window.innerWidth, window.innerHeight) < 600;
    const active = phone && document.getElementById('screen-game').classList.contains('active');
    const width = Math.round(viewport ? viewport.width : window.innerWidth);
    const height = Math.round(viewport ? viewport.height : window.innerHeight);
    const rotated = active && height > width;
    shell.classList.toggle('phone-game', active);
    shell.classList.toggle('portrait-game', rotated);
    shell.classList.toggle('short-game', active && Math.min(width, height) < 310);
    shell.style.setProperty('--game-width', `${Math.max(width, height)}px`);
    shell.style.setProperty('--game-height', `${Math.min(width, height)}px`);
    shell.style.setProperty('--viewport-left', `${viewport ? viewport.offsetLeft : 0}px`);
    shell.style.setProperty('--viewport-top', `${viewport ? viewport.offsetTop : 0}px`);
    document.documentElement.classList.toggle('phone-game-active', active);
    if (typeof layoutHand === 'function') layoutHand();
    fitPlays();
  }

  function queueSync() {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = 0; sync(); });
  }

  function init() {
    if (shell) return;
    shell = document.createElement('div');
    shell.id = 'game-viewport';
    document.body.appendChild(shell);
    ['screen-game', 'help-modal', 'toast-wrap'].forEach(id => shell.appendChild(document.getElementById(id)));
    window.addEventListener('resize', queueSync);
    window.addEventListener('orientationchange', queueSync);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueSync);
      window.visualViewport.addEventListener('scroll', queueSync);
    }
    if (coarse.addEventListener) coarse.addEventListener('change', queueSync);
    sync();
  }

  return { init, sync, fitPlays };
})();
