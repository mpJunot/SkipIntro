# SkipIntro v1.2.0

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
[SkipIntro] Ready — v1.2.0 — https://www.netflix.com/watch/…
```

## Options (popup)

| Réglage | Effet |
| --- | --- |
| Auto skip intro | Clique intro / recap / opening |
| Auto skip credits | Clique générique / ending / épisode suivant |
| Keep fullscreen between episodes | Empêche la sortie de plein écran au changement d'épisode |
| Floating exclude button | Affiche ou masque le bouton « + » sur le lecteur |
| Delay before click | Attente avant le clic, 0–10000 ms |
| Excluded URLs | Pages où l'extension ne fait rien |

Le bouton flottant mint « + » en bas à droite du lecteur ajoute la page courante aux
exclusions en un clic ; il se masque depuis le popup, sans recharger la page.

## Comment ça marche

`content/player.js` observe le DOM et lit un libellé sur chaque bouton visible,
dans cet ordre : `aria-label` (Crunchyroll), `data-uia` (Netflix), puis le texte
visible du bouton (Disney+). Le libellé est normalisé (accents, majuscules) et
classé intro ou générique par mots-clés FR/EN. Pas de branche par plateforme :
ajouter un service = ajouter son sélecteur et ses hôtes.

Le lecteur Disney+ actuel enterre son bouton deux shadow roots plus bas
(`<skip-overlay>` → `<skip-button>` → `<button>`), hors de portée de
`querySelector` : il est récupéré à part dans `listSkipButtons()`.
`button.skip__button` reste là pour l'ancien lecteur en DOM clair.

### Plein écran

La spec Fullscreen sort du plein écran dès que l'élément concerné quitte le DOM,
et Disney+ remonte son conteneur de lecteur à chaque changement d'épisode. Rien
ne peut le rétablir après coup : `requestFullscreen()` n'exige pas seulement une
activation transitoire, il la **consomme**. Quand le lecteur répond au clic, il
dépense l'activation ; un handler `fullscreenchange` arrive donc toujours trop
tard, avec un solde à zéro. WebKit le dit franchement :

```
Cannot request fullscreen without transient activation.
```

D'où deux mécanismes, tous deux sous le réglage « Keep fullscreen between
episodes ».

`preemptFullscreen()` **prend le clic de vitesse**, en phase de capture, avant
le lecteur. Il reconnaît le bouton plein écran à son libellé (`composedPath()`,
pour traverser les shadow roots) ou un double-clic sur la vidéo, et demande le
plein écran sur `<html>`, qu'aucune navigation SPA ne démonte. C'est nous qui
consommons l'activation, et la demande du lecteur est celle qui échoue. Un clic
alors qu'on est déjà en plein écran est ignoré : c'est l'utilisateur qui sort.

`onFullscreenChange()` couvre les gestes que la préemption ne peut pas réclamer
(le raccourci `F`, un bouton non reconnu). Un élément plein écran qui a quitté le
document a été démonté par la page, pas congédié par l'utilisateur : ce
`isConnected` à `false` est le seul signal qui distingue les deux cas. Le
content script prévient alors `background/service-worker.js`, seul endroit d'où
`chrome.windows.update({ state: 'fullscreen' })` peut agir sans geste. C'est le
plein écran de la fenêtre, pas du lecteur : un repli, pas un équivalent.

Ajouter une plateforme :

1. hôte dans `host_permissions` **et** `content_scripts.matches` de `manifest.json`
2. si besoin, son sélecteur dans `listSkipButtons()`
3. `./sync-firefox.sh`

## Développement

`firefox/` est un miroir versionné, pas un dossier de build ignoré. Après toute
modification de `manifest.json`, `content/`, `background/`, `popup/` ou `icons/` :

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

`test/fullscreen-keep.html` vérifie la préemption et le repli, et
`test/disney-skip.html` que le bouton Disney+ caché dans le shadow DOM est bien
cliqué. Même commande, en changeant le fichier. Attendus :

```
preempt_on_button=true | preempt_on_dblclick=true | ignores_other_click=true |
ignores_exit_click=true | fallback_on_teardown=true | silent_on_user_exit=true |
setting_off=true

intro_clicked=true
```

Le plein écran réel exige un geste utilisateur, hors de portée d'une page
headless : les tests stubent `document.fullscreenElement` et
`requestFullscreen()` pour ne vérifier que la logique de décision.

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

**1.2.0** — Plein écran conservé au changement d'épisode (préemption du clic sur
`<html>`, repli fenêtre via service worker), bouton Disney+ retrouvé dans son
shadow DOM.

**1.1.0** — Disney+ (`button.skip__button`, libellé lu dans le texte du bouton),
direction artistique Signal (accent mint, nouvelle icône), option d'affichage du
bouton flottant, version affichée dans le log du content script.

**1.0.0** — Crunchyroll et Netflix, délai avant clic, URLs exclues.
