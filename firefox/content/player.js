(function () {
  'use strict';

  const TAG = '[SkipIntro]';
  console.log(TAG, 'Content script loaded!');

  const DEFAULTS = {
    skipIntro: true,
    skipCredits: true,
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
  // Disney+ has neither: its button is .skip__button and the label is the
  // visible text ("SKIP INTRO" / "SKIP RECAP" / "SKIP CREDITS"), so
  // textContent is the last fallback — it only applies to those buttons.
  function listSkipButtons() {
    const out = [];
    const sel =
      'button[aria-label], button[data-uia], [data-uia][role="button"], button.skip__button';
    document.querySelectorAll(sel).forEach((btn) => {
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
