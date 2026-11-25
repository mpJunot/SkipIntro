// Vérifie quels onglets ouverts depuis Anime-Sama le service worker ferme.
// Lancer : node test/ad-tabs.mjs
// Attendu : OK (et rien d'autre)
import { readFileSync } from 'node:fs';

const closed = [];
let onCreated;
globalThis.chrome = {
  runtime: { onMessage: { addListener() {} }, lastError: null },
  windows: { update() {} },
  tabs: {
    onCreated: { addListener: (fn) => (onCreated = fn) },
    get: (id, cb) => cb({ id, url: 'https://anime-sama.to/catalogue/x/saison1/vostfr/' }),
    remove: (id) => closed.push(id),
    update() {},
  },
};
new Function(readFileSync(new URL('../background/service-worker.js', import.meta.url), 'utf8'))();

const cases = {
  'chrome://extensions/': false,
  'brave://extensions/': false,
  'chrome://newtab/': false,
  'chrome-extension://abc/options.html': false,
  'https://anime-sama.to/catalogue/': false,
  'https://ads.example.com/x': true,
  'about:blank': true,
  '': true,
};
let id = 0;
const fails = [];
for (const [url, shouldClose] of Object.entries(cases)) {
  closed.length = 0;
  onCreated({ id: ++id, openerTabId: 1, pendingUrl: url || undefined, url: '' });
  if (closed.includes(id) !== shouldClose) fails.push(`${url || '(blank)'}: closed=${!shouldClose}`);
}
onCreated({ id: ++id, openerTabId: undefined, pendingUrl: 'https://ads.example.com/' });
if (closed.includes(id)) fails.push('tab without opener closed');
console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'OK');
