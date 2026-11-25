const TAG = '[SkipIntro]';

// ponytail: a content script can never enter fullscreen on its own — the API
// needs a user gesture the episode transition doesn't have. The extension
// APIs can, but they act on the window (F11-style) rather than the player,
// so this is the fallback for when preemption never got a click to claim.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'restoreFullscreen') return;
  const windowId = sender.tab && sender.tab.windowId;
  if (windowId === undefined) return;
  Promise.resolve(chrome.windows.update(windowId, { state: 'fullscreen' })).catch(
    (err) => {
      console.log(TAG, 'Window fullscreen refused —', err && err.message);
    }
  );
});

// Anime-Sama / Voiranime ad scripts open a tab on the first click anywhere.
// Refusing the popup inside the page (window.open → null) makes Voiranime's
// script retaliate by sending the tab back through history, so let the popup
// open and close it here instead: the page never learns it failed.
// ponytail: any new web tab those sites open towards another domain is
// closed, legit external links included; same-site tabs (middle click) and
// browser pages stay. Check: node test/ad-tabs.mjs
const ANIME_SITE = /(^|\.)(anime-sama|voir-?anime)\./;

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
}

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId === undefined) return;
  chrome.tabs.get(tab.openerTabId, (opener) => {
    if (chrome.runtime.lastError || !opener) return;
    const from = hostOf(opener.url || '');
    if (!ANIME_SITE.test(from)) return;
    const target = tab.pendingUrl || tab.url || '';
    // Only web pages and blank tabs are ads. The browser also gives an opener
    // to tabs it opens itself from this tab (chrome://extensions,
    // brave://newtab, an extension's options page): those stay.
    if (target && target !== 'about:blank' && !/^https?:/.test(target)) return;
    const to = hostOf(target);
    if (to && to === from) return;
    console.log(TAG, 'Ad tab closed —', tab.pendingUrl || tab.url || '(blank)');
    chrome.tabs.remove(tab.id);
    chrome.tabs.update(opener.id, { active: true });
  });
});
