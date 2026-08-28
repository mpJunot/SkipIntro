# SkipIntro

Clique automatiquement « Skip Intro » / « Skip Credits » / « Épisode suivant » sur
**Crunchyroll**, **Netflix** et **Disney+**.

## Installation

**Chrome / Edge / Brave** — `chrome://extensions` → activer le mode développeur →
« Charger l'extension non empaquetée » → sélectionner la racine du dépôt.

**Firefox** — `about:debugging#/runtime/this-firefox` → « Charger un module
temporaire » → sélectionner `firefox/manifest.json`. Firefox 109+ requis.

Après un `git pull`, recharger l'extension (bouton ↻) **et** rafraîchir l'onglet du
lecteur : le content script n'est pas rechargé à chaud.

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
