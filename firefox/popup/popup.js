const DEFAULTS = {
  skipIntro: true,
  skipCredits: true,
  skipDelayMs: 0,
  showFab: true,
  EXCLUDE_URLS: [],
};

async function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}

async function storageSet(obj) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(obj, resolve);
  });
}

function normalizeUrl(url) {
  return String(url || '')
    .trim()
    .replace(/#.*$/, '');
}

function addExcludeUrl(items, url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  if (items.includes(normalized)) return false;
  items.push(normalized);
  return true;
}

function renderList(listEl, items) {
  listEl.innerHTML = '';
  document.getElementById('excludedCount').textContent = String(items.length);
  items.forEach((item) => {
    const li = document.createElement('li');
    li.classList.add('list-item');

    const span = document.createElement('span');
    span.textContent = item;
    li.appendChild(span);

    const btn = document.createElement('button');
    btn.textContent = 'x';
    btn.classList.add('remove-btn');
    li.appendChild(btn);

    listEl.appendChild(li);

    btn.addEventListener('click', () => {
      const index = items.indexOf(item);
      if (index !== -1) {
        items.splice(index, 1);
        storageSet({ EXCLUDE_URLS: items });
        renderList(listEl, items);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const data = await storageGet(DEFAULTS);
  const skipIntro = document.getElementById('skipIntro');
  const skipCredits = document.getElementById('skipCredits');
  const skipDelayMs = document.getElementById('skipDelayMs');
  const showFab = document.getElementById('showFab');
  const excludeUrls = document.getElementById('add-url');
  const excludeList = document.getElementById('excludedUrls');

  skipIntro.checked = data.skipIntro !== false;
  skipCredits.checked = data.skipCredits !== false;
  skipDelayMs.value = String(Math.max(0, Number(data.skipDelayMs) || 0));
  showFab.checked = data.showFab !== false;

  skipIntro.addEventListener('change', () => {
    storageSet({ skipIntro: skipIntro.checked });
  });
  skipCredits.addEventListener('change', () => {
    storageSet({ skipCredits: skipCredits.checked });
  });

  showFab.addEventListener('change', () => {
    storageSet({ showFab: showFab.checked });
  });

  skipDelayMs.addEventListener('change', () => {
    let v = Number(skipDelayMs.value);
    if (Number.isNaN(v) || v < 0) v = 0;
    if (v > 10000) v = 10000;
    skipDelayMs.value = String(v);
    storageSet({ skipDelayMs: v });
  });

  excludeUrls.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (addExcludeUrl(data.EXCLUDE_URLS, excludeUrls.value)) {
        storageSet({ EXCLUDE_URLS: data.EXCLUDE_URLS });
        renderList(excludeList, data.EXCLUDE_URLS);
        excludeUrls.value = '';
      }
      excludeUrls.blur();
      excludeUrls.value = '';
    }
  });

  renderList(excludeList, data.EXCLUDE_URLS);
});
