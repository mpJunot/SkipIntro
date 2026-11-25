(function () {
  'use strict';

  // Anime-Sama / Voiranime have no skip button to click, and every click that
  // reaches the page can pop an ad. So this draws its own control bar and
  // swallows its clicks before any page script sees them.
  const MSG = 'skipintro-anime';

  // Video side: the video lives in a third-party player iframe (sibnet,
  // vidmoly…), sometimes nested. Act on it, or pass the order further down.
  function broadcast(cmd, by) {
    document.querySelectorAll('iframe').forEach((f) => {
      if (f.contentWindow) f.contentWindow.postMessage({ [MSG]: cmd, by }, '*');
    });
  }

  function control(cmd, by) {
    const v = document.querySelector('video');
    if (!v) return broadcast(cmd, by);
    if (cmd === 'seek') v.currentTime = Math.min(v.duration || Infinity, v.currentTime + by);
    if (cmd === 'toggle') v.paused ? v.play() : v.pause();
  }

  // ponytail: matched on every site, because Anime-Sama rotates its player
  // hosts (ansembed.net, uqload, random voe mirrors…). The name test covers
  // their own domain changes too. ancestorOrigins (Chrome) keeps the relay
  // silent under any other top page; Firefox lacks it, and the relay alone
  // only obeys its direct parent anyway.
  const SITE = /(^|[./])(anime-sama|voir-?anime)\./;
  const top = location.ancestorOrigins
    ? location.ancestorOrigins[location.ancestorOrigins.length - 1] || location.origin
    : location.origin;
  if (location.ancestorOrigins && !SITE.test(top)) return;

  // The mouse over the video is inside the player iframe, invisible to the
  // top page, so frames report movement up for the auto-hiding bar. Only
  // after the top page said 'hello' down the chain, so frames under any
  // other site stay quiet (Firefox has no ancestorOrigins to check).
  let reportMoves = false;
  let lastMove = 0;
  addEventListener(
    'mousemove',
    () => {
      if (!reportMoves || Date.now() - lastMove < 250) return;
      lastMove = Date.now();
      window.top.postMessage({ [MSG]: 'move' }, '*');
    },
    { passive: true }
  );

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window.parent || !d || typeof d[MSG] !== 'string') return;
    if (d[MSG] === 'hello') {
      reportMoves = window !== window.top;
      return broadcast('hello', 0);
    }
    control(d[MSG], Number(d.by) || 0);
  });

  if (window !== window.top || !SITE.test(location.hostname)) return;

  let introSec = 85;
  let introBtn = null;
  function setIntroSec(v) {
    introSec = Number(v) || 85;
    if (introBtn) introBtn.textContent = `+${introSec} s`;
  }
  chrome.storage.sync.get({ introSkipSec: 85 }, (d) => setIntroSec(d.introSkipSec));
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync' && c.introSkipSec) setIntroSec(c.introSkipSec.newValue);
  });

  function playerFrame() {
    return document.querySelector('#playerDF, iframe[allowfullscreen], video');
  }

  function nextEpisode() {
    // Anime-Sama: its own "Suivant" is selectedIndex++ then onchange, and a
    // change event is nothing ad scripts listen to.
    const sel = document.getElementById('selectEpisodes');
    if (sel) {
      if (sel.selectedIndex < sel.options.length - 1) {
        sel.selectedIndex++;
        sel.dispatchEvent(new Event('change'));
        return;
      }
      const season = document.getElementById('ctSaisonSuivante');
      if (season && !season.hidden && season.href && !season.href.endsWith('#'))
        location.href = season.href;
      return;
    }
    // Voiranime: a plain "Suivant" link with no rel or class to go by, so
    // match its text. Navigate ourselves rather than click it.
    const a = [...document.querySelectorAll('a[href]')].find(
      (el) => el.rel === 'next' || /^(suivant|next)\b/i.test(el.textContent.trim())
    );
    if (a) location.href = a.href;
  }

  // ponytail: fullscreen goes on the iframe's parent, not the iframe, so the
  // bar can follow inside it; Anime-Sama swaps the iframe on episode change
  // but keeps the parent, so fullscreen survives "Suivant".
  function toggleFullscreen() {
    if (document.fullscreenElement) return document.exitFullscreen();
    const f = playerFrame();
    const target = f && f.tagName === 'IFRAME' ? f.parentElement : f;
    if (!target) return;
    target.classList.add('skipintro-fs');
    target.requestFullscreen().catch(() => {});
  }

  const ACTIONS = {
    toggle: () => control('toggle', 0),
    back: () => control('seek', -10),
    intro: () => control('seek', introSec),
    fs: toggleFullscreen,
    next: nextEpisode,
  };

  let host = null;

  // Registered at document_start, so ahead of every page listener: the bar's
  // pointer events stop here and never reach the ad scripts.
  [
    'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick',
    'auxclick', 'contextmenu', 'touchstart', 'touchend',
  ].forEach((type) =>
    window.addEventListener(
      type,
      (e) => {
        const path = e.composedPath();
        if (!host || !path.includes(host)) return;
        e.stopImmediatePropagation();
        if (type !== 'click') return;
        e.preventDefault();
        const btn = path.find((el) => el.dataset && el.dataset.act);
        if (btn) ACTIONS[btn.dataset.act]();
      },
      true
    )
  );

  // Voiranime drops a fixed, near-transparent, viewport-sized layer over the
  // page whose only content is an ad link: the first click anywhere opens it.
  // ponytail: heuristic on body's direct children; widen it if they nest it.
  function removeClickTraps() {
    for (const el of [...document.body.children]) {
      if (el === host || !(el.tagName === 'A' || el.querySelector('a'))) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && Number(cs.opacity) < 0.1) el.remove();
    }
  }

  // Voiranime only shows its player after a captcha, so an episode list is
  // enough to call this an episode page.
  function isEpisodePage() {
    return playerFrame() || document.querySelector('#selectEpisodes, select#episodes');
  }

  // Top-centre of the player, following it as the page scrolls. Not the
  // bottom: subtitles, the player's controls and its own cards ("Reprendre
  // la lecture ?") live there, inside a cross-origin iframe the page can't
  // see into. No usable player (Voiranime before its captcha, player
  // scrolled away) → bottom-centre of the window.
  function place() {
    const f = playerFrame();
    const r = f && f.getBoundingClientRect();
    const onScreen = r && r.width > 300 && r.bottom > 120 && r.top < innerHeight - 60;
    const centre = onScreen ? r.left + r.width / 2 : innerWidth / 2;
    host.style.cssText =
      'position:fixed;z-index:2147483647;transform:translateX(-50%);' +
      `left:${centre}px;` +
      (onScreen ? `top:${Math.max(8, r.top + 12)}px;` : 'bottom:24px;');
    broadcast('hello', 0); // also reaches the iframe of a new episode
  }

  // Hidden after 2.5 s without the mouse moving, like a player's own
  // controls; kept while the pointer rests on it.
  let bar = null;
  let idleTimer = null;
  function wake() {
    if (!bar) return;
    bar.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function hide() {
      if (bar.matches(':hover')) idleTimer = setTimeout(hide, 1000);
      else bar.classList.add('idle');
    }, 2500);
  }

  function buildBar() {
    if (host || !isEpisodePage()) return;
    const style = document.createElement('style');
    style.textContent = `
      .skipintro-fs { background: #000 !important; }
      .skipintro-fs > iframe, .skipintro-fs > video { width: 100% !important; height: 100% !important; }
    `;
    document.head.appendChild(style);

    host = document.createElement('div');
    place();
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        div { display: flex; gap: 6px; padding: 6px; border-radius: 12px; background: #14181Fdd;
          transition: opacity 0.3s ease; }
        div.idle { opacity: 0; pointer-events: none; }
        button { all: unset; cursor: pointer; padding: 8px 12px; border-radius: 8px;
          font: 600 13px system-ui, sans-serif; color: #F2F4F7; background: #191F29; }
        button:hover { background: #232B38; }
        button[data-act="intro"], button[data-act="next"] { background: #34E0A1; color: #0B0D10; }
      </style>
      <div>
        <button data-act="back" title="Reculer de 10 s">−10 s</button>
        <button data-act="toggle" title="Lecture / pause">⏯</button>
        <button data-act="intro" title="Sauter l'intro"></button>
        <button data-act="next" title="Épisode suivant">Suivant ⏭</button>
        <button data-act="fs" title="Plein écran">⛶</button>
      </div>`;
    bar = root.querySelector('div');
    introBtn = root.querySelector('[data-act="intro"]');
    setIntroSec(introSec);
    document.body.appendChild(host);
    document.addEventListener('fullscreenchange', () => {
      (document.fullscreenElement || document.body).appendChild(host);
      place();
    });
    addEventListener('scroll', place, { passive: true });
    addEventListener('resize', place);
    setInterval(place, 1000); // the site moves the player around (cinema mode, ads)
    addEventListener('mousemove', wake, { passive: true });
    addEventListener('message', (e) => e.data && e.data[MSG] === 'move' && wake());
    wake();
  }

  // The player iframe may be injected late; give it 10 s, then the page
  // simply isn't an episode page.
  function waitForPlayer() {
    const t = setInterval(buildBar, 500);
    setTimeout(() => clearInterval(t), 10000);
    buildBar();
  }
  function start() {
    removeClickTraps();
    new MutationObserver(removeClickTraps).observe(document.body, { childList: true });
    waitForPlayer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
