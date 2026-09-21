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
