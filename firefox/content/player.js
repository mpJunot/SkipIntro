(function () {
  'use strict';

  const TAG = '[SkipIntro]';
  console.log(TAG, 'Content script loaded!');

  const DEFAULTS = {
    skipIntro: true,
    skipCredits: true,
    keepFullscreen: true,
    skipDelayMs: 0,
    showFab: true,
    EXCLUDE_URLS: [],
  };

  let settings = { ...DEFAULTS };
  let fabEl = null;
  let cooldownUntil = 0;
  let pendingSkipTimer = null;
  let pendingSkipKind = null;
  let lastDetectLogKey = null;
  let lastFullscreenEl = null;

  function logDetected(kind, el, detail) {
    const key = `${kind}|${detail}|${el ? el.tagName : ''}`;
    if (key === lastDetectLogKey) return;
    lastDetectLogKey = key;
  }

  function clearDetectLog() {
    lastDetectLogKey = null;
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, resolve);
    });
  }

  async function loadSettings() {
    return storageGet(DEFAULTS).then((data) => {
      settings = { ...DEFAULTS, ...data };
    });
  }

  function normalizeLabel(text) {
    return (text || '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isIntroLabel(upper) {
    return (
      upper.includes('INTRO') ||
      upper.includes('OPENING') ||
      upper.includes('OUVERTURE') ||
      upper.includes('RECAP') ||
      upper.includes('RESUME')
    );
  }

  function isCreditsLabel(upper) {
    return (
      upper.includes('CREDIT') ||
      upper.includes('ENDING') ||
      upper.includes('OUTRO') ||
      upper.includes('GENERIQUE') ||
      upper.includes('NEXT-EPISODE') ||
      upper.includes('NEXT EPISODE') ||
      upper.includes('EPISODE SUIVANT')
    );
  }

  function classifySkipButton(entry) {
    const u = entry.upper;
    if (isIntroLabel(u)) return { intro: true, credits: false };
    if (isCreditsLabel(u)) return { intro: false, credits: true };
    return { intro: false, credits: false };
  }

  // ponytail: Netflix has no aria-label on its skip buttons, but data-uia
  // ("player-skip-intro", "player-skip-recap", "next-episode-seamless-button")
  // reads like a label, so the existing classifier handles it as-is.
  // Disney+ has neither: the label is the visible localized text
  // ("PASSER L'INTRO" / "SKIP RECAP"), so textContent is the last fallback.
  // Its current player hides the button two shadow roots deep
  // (<skip-overlay> → <skip-button> → <button>), out of querySelector's
  // reach; .skip__button is the old light-DOM player.
  function listSkipButtons() {
    const out = [];
    const sel =
      'button[aria-label], button[data-uia], [data-uia][role="button"], button.skip__button';
    const candidates = [...document.querySelectorAll(sel)];
    const dpBtn = document
      .querySelector('skip-overlay')
      ?.shadowRoot?.querySelector('skip-button')
      ?.shadowRoot?.querySelector('button');
    if (dpBtn) candidates.push(dpBtn);
    candidates.forEach((btn) => {
      if (!isVisible(btn)) return;
      const raw = (
        btn.getAttribute('aria-label') ||
        btn.getAttribute('data-uia') ||
        btn.textContent ||
        ''
      ).trim();
      if (!raw) return;
      out.push({
        btn,
        raw,
        upper: normalizeLabel(raw),
      });
    });
    return out;
  }

  function inCooldown() {
    return Date.now() < cooldownUntil;
  }

  function clickElement(el) {
    if (!el) return;
    el.click();
    cooldownUntil = Date.now() + 2500;
    clearDetectLog();
  }

  function performScheduledClick() {
    const kind = pendingSkipKind;
    pendingSkipKind = null;
    if (!document.querySelector('video')) return;

    for (const entry of listSkipButtons()) {
      const { intro, credits } = classifySkipButton(entry);
      if (kind === 'intro' && intro) {
        clickElement(entry.btn);
        return;
      }
      if (kind === 'credits' && credits && !intro) {
        clickElement(entry.btn);
        return;
      }
    }

    const wrap = document.querySelector('[data-testid="skipButton"]');
    if (wrap) {
      const btn = wrap.querySelector('[role="button"]') || wrap;
      clickElement(btn);
    }
  }

  function scheduleSkip(kind) {
    if (pendingSkipTimer !== null || inCooldown()) return;
    pendingSkipKind = kind;
    const delay = Math.max(0, settings.skipDelayMs | 0);
    pendingSkipTimer = setTimeout(() => {
      pendingSkipTimer = null;
      performScheduledClick();
    }, delay);
  }

  function classifyTestIdLabel(upper, pastHalf) {
    const intro = isIntroLabel(upper);
    const skipLike =
      upper.includes('SKIP') ||
      upper.includes('PASSER') ||
      upper.includes('SAUTER');
    const credits = isCreditsLabel(upper) || (pastHalf && !intro && skipLike);
    return { intro, credits };
  }

  function trySkip() {
    const video = document.querySelector('video');
    if (!video) {
      clearDetectLog();
      return;
    }

    const pastHalf =
      video.duration > 0 && (video.currentTime || 0) > video.duration * 0.5;

    for (const entry of listSkipButtons()) {
      const { intro, credits } = classifySkipButton(entry);
      if (!intro && !credits) continue;
      if (inCooldown()) return;

      if (settings.skipIntro && intro) {
        logDetected('aria-label · intro', entry.btn, entry.raw);
        scheduleSkip('intro');
        return;
      }
      if (settings.skipCredits && credits && !intro) {
        logDetected('aria-label · credits', entry.btn, entry.raw);
        scheduleSkip('credits');
        return;
      }
      return;
    }

    const wrap = document.querySelector('[data-testid="skipButton"]');
    if (!wrap) {
      clearDetectLog();
      return;
    }
    if (inCooldown()) return;

    const labelEl = wrap.querySelector('[data-testid="skipIntroText"]');
    const labelRaw = labelEl?.textContent || '';
    const upper = normalizeLabel(labelRaw);
    const { intro, credits } = classifyTestIdLabel(upper, pastHalf);

    if (settings.skipIntro && intro) {
      logDetected('data-testid · intro', wrap, labelRaw.trim());
      scheduleSkip('intro');
      return;
    }
    if (settings.skipCredits && credits) {
      logDetected('data-testid · credits', wrap, labelRaw.trim());
      scheduleSkip('credits');
    }
  }

  function legacySkipIntro() {
    if (!settings.skipIntro || inCooldown() || pendingSkipTimer !== null)
      return;
    const el = document.querySelector('[data-testid="skipIntroText"]');
    if (!el || el.closest('[data-testid="skipButton"]')) return;
    logDetected('skipIntroText (legacy)', el, (el.textContent || '').trim());
    const delay = Math.max(0, settings.skipDelayMs | 0);
    pendingSkipKind = 'intro';
    pendingSkipTimer = setTimeout(() => {
      pendingSkipTimer = null;
      const t = document.querySelector('[data-testid="skipIntroText"]');
      if (t && !t.closest('[data-testid="skipButton"]')) {
        console.log(TAG, 'Click — skipIntroText (legacy) —', t);
        t.click();
        cooldownUntil = Date.now() + 2500;
        pendingSkipKind = null;
      } else {
        performScheduledClick();
      }
    }, delay);
  }

  loadSettings().then(() => {
    console.log(
      TAG,
      'Ready — v' + chrome.runtime.getManifest().version,
      '—',
      location.href
    );
    console.log(TAG, 'Current settings:', settings);
    tick();
    const obs = new MutationObserver(() => tick());
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(tick, 800);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('click', preemptFullscreen, true);
    document.addEventListener('dblclick', preemptFullscreen, true);

    if (!document.body) {
      const waitForBody = setInterval(() => {
        if (document.body) {
          clearInterval(waitForBody);
          injectFab();
        }
      }, 100);
      setTimeout(() => clearInterval(waitForBody), 5000);
    } else {
      injectFab();
    }

    function injectFab() {
      const style = document.createElement('style');
      style.textContent = `
        .crunchyskip-fab {
          position: fixed !important;
          right: 24px !important;
          bottom: 24px !important;
          width: 56px !important;
          height: 56px !important;
          border: none !important;
          border-radius: 50% !important;
          background: #34E0A1 !important;
          color: #0B0D10 !important;
          font-size: 28px !important;
          line-height: 1 !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          box-shadow: 0 12px 28px rgba(52, 224, 161, 0.32) !important;
          z-index: 10000 !important;
          transition: box-shadow 0.2s ease, transform 0.2s ease !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .crunchyskip-fab:hover {
          transform: scale(1.08) !important;
          box-shadow: 0 16px 36px rgba(52, 224, 161, 0.4) !important;
        }
        .crunchyskip-fab:focus-visible {
          outline: none !important;
          box-shadow: 0 0 0 4px rgba(52, 224, 161, 0.3), 0 12px 28px rgba(52, 224, 161, 0.32) !important;
        }
        .crunchyskip-fab:active {
          transform: scale(0.95) !important;
        }
        .crunchyskip-fab--off {
          display: none !important;
        }
      `;
      document.head.appendChild(style);

      const fab = document.createElement('button');
      fab.className = 'crunchyskip-fab';
      fab.type = 'button';
      fab.textContent = '+';
      fab.title = 'Add current page to SkipIntro exclusions';
      fab.addEventListener('click', () => {
        const currentUrl = location.href.replace(/#.*$/, '');
        if (currentUrl && !settings.EXCLUDE_URLS.includes(currentUrl)) {
          settings.EXCLUDE_URLS.push(currentUrl);
          chrome.storage.sync.set({ EXCLUDE_URLS: settings.EXCLUDE_URLS });
          fab.textContent = '✓';
          setTimeout(() => {
            fab.textContent = '+';
          }, 1500);
        }
      });
      fabEl = fab;
      applyFabVisibility();
      document.body.appendChild(fab);
    }
  });

  function applyFabVisibility() {
    if (fabEl) fabEl.classList.toggle('crunchyskip-fab--off', !settings.showFab);
  }

  function isFullscreenControl(el) {
    if (!(el instanceof Element)) return false;
    const raw = (
      el.getAttribute('aria-label') ||
      el.getAttribute('data-uia') ||
      el.getAttribute('title') ||
      ''
    ).trim();
    if (!raw) return false;
    const upper = normalizeLabel(raw);
    return (
      upper.includes('FULL SCREEN') ||
      upper.includes('FULLSCREEN') ||
      upper.includes('PLEIN ECRAN')
    );
  }

  // ponytail: the spec drops fullscreen as soon as the fullscreen element
  // leaves the DOM, and Disney+ re-mounts its player container on every
  // episode change. Re-entering afterwards is impossible: requestFullscreen()
  // doesn't just need transient activation, it *consumes* it, so by the time
  // fullscreenchange fires the player has already spent the click.
  // So claim the click first, in the capture phase — we take fullscreen on
  // documentElement, which no SPA navigation removes, and the player's own
  // request is the one left without activation.
  function preemptFullscreen(e) {
    if (!settings.keepFullscreen) return;
    // Already fullscreen means this click is the user leaving; let them.
    if (document.fullscreenElement) return;
    const path = e.composedPath();
    const wanted =
      e.type === 'dblclick'
        ? path.some((el) => el instanceof Element && el.tagName === 'VIDEO')
        : path.some(isFullscreenControl);
    if (!wanted) return;
    document.documentElement.requestFullscreen().catch((err) => {
      console.log(TAG, 'Fullscreen preempt refused —', err && err.message);
    });
  }

  // Fallback for the gestures preemption can't claim (the F shortcut, a
  // control we failed to recognise): a fullscreen element that is gone from
  // the document was torn down by the page, not dismissed by the user, and
  // only the extension APIs can restore fullscreen without a gesture.
  function onFullscreenChange() {
    const el = document.fullscreenElement;
    if (el) {
      lastFullscreenEl = el;
      return;
    }
    const dropped = lastFullscreenEl;
    lastFullscreenEl = null;
    if (!settings.keepFullscreen || !dropped || dropped.isConnected) return;
    chrome.runtime.sendMessage({ type: 'restoreFullscreen' });
  }

  function tick() {
    const currentUrl = location.href;

    const isExcluded = settings.EXCLUDE_URLS.some((excludedUrl) => {
      return (
        typeof excludedUrl === 'string' &&
        excludedUrl.trim() !== '' &&
        currentUrl.includes(excludedUrl.trim())
      );
    });

    if (isExcluded) {
      return;
    }
    trySkip();
    legacySkipIntro();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    Object.keys(changes).forEach((k) => {
      if (k in DEFAULTS) settings[k] = changes[k].newValue;
    });
    if ('showFab' in changes) applyFabVisibility();
  });
})();
