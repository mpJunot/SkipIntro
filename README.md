# SkipIntro v1.1.0

Clique automatiquement « Skip Intro » / « Skip Credits » / « Épisode suivant » sur
**Crunchyroll**, **Netflix** et **Disney+**.

## Installation

**Chrome / Edge / Brave** — `chrome://extensions` → activer le mode développeur →
« Charger l'extension non empaquetée » → sélectionner la racine du dépôt.

**Firefox** — `about:debugging#/runtime/this-firefox` → « Charger un module
temporaire » → sélectionner `firefox/manifest.json`. Firefox 109+ requis.

Après un `git pull`, recharger l'extension (bouton ↻) **puis** rafraîchir l'onglet du
lecteur, dans cet ordre. Le popup est relu à chaque ouverture, pas le content script :
celui déjà injecté garde l'ancien code et n'écoute pas les nouvelles options, donc
elles semblent sans effet. La console de l'onglet dit quelle version tourne :

```
[SkipIntro] Ready — v1.1.0 — https://www.netflix.com/watch/…
```

## Options (popup)

| Réglage | Effet |
| --- | --- |
| Auto skip intro | Clique intro / recap / opening |
| Auto skip credits | Clique générique / ending / épisode suivant |
| Floating exclude button | Affiche ou masque le bouton « + » sur le lecteur |
| Delay before click | Attente avant le clic, 0–10000 ms |
| Excluded URLs | Pages où l'extension ne fait rien |

Le bouton flottant mint « + » en bas à droite du lecteur ajoute la page courante aux
exclusions en un clic ; il se masque depuis le popup, sans recharger la page.

## Comment ça marche

`content/player.js` observe le DOM et lit un libellé sur chaque bouton visible,
dans cet ordre : `aria-label` (Crunchyroll), `data-uia` (Netflix), puis le texte
visible de `button.skip__button` (Disney+). Le libellé est normalisé (accents,
majuscules) et classé intro ou générique par mots-clés FR/EN. Pas de branche par
plateforme : ajouter un service = ajouter son sélecteur et ses hôtes.

Ajouter une plateforme :

1. hôte dans `host_permissions` **et** `content_scripts.matches` de `manifest.json`
2. si besoin, son sélecteur dans `listSkipButtons()`
3. `./sync-firefox.sh`

## Développement

`firefox/` est un miroir versionné, pas un dossier de build ignoré. Après toute
modification de `manifest.json`, `content/`, `popup/` ou `icons/` :

```sh
./sync-firefox.sh
```

### Test

`test/fab-toggle.html` vérifie que le FAB réagit à un changement de `showFab` sans
rechargement, avec un `chrome.storage` stubé :

```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless=new \
  --disable-gpu --virtual-time-budget=3000 --dump-dom test/fab-toggle.html | grep result
```

Attendu : `injected=true | visible_default=true | hidden_after_off=true | visible_after_on=true`

### Icône

La source est `icons/icon.svg`. Pour regénérer les PNG :

```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 --window-size=512,512 \
  --screenshot=icon512.png "file://$PWD/icons/icon.svg"
for n in 16 48 128; do cp icon512.png icons/icon$n.png; sips -z $n $n icons/icon$n.png; done
rm icon512.png && ./sync-firefox.sh
```

Chrome headless refuse les fenêtres < ~500 px : d'où le rendu à 512 puis la
réduction.

### Direction artistique

Accent mint `#34E0A1`, fond `#0B0D10`, surfaces `#14181F` sans bordure, champs
`#191F29`, texte `#F2F4F7` / `#7C8595`, rayon 12 px, micro-labels 9 px uppercase
tracés à 0.12em. Les tokens vivent dans `popup/popup.css`.

## Versions

**1.1.0** — Disney+ (`button.skip__button`, libellé lu dans le texte du bouton),
direction artistique Signal (accent mint, nouvelle icône), option d'affichage du
bouton flottant, version affichée dans le log du content script.

**1.0.0** — Crunchyroll et Netflix, délai avant clic, URLs exclues.
