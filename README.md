# SkipIntro v1.4.0

Clique automatiquement « Skip Intro » / « Skip Credits » / « Épisode suivant » sur
**Crunchyroll**, **Netflix**, **Disney+** et **Prime Video**, plus une barre de
contrôle sur **Anime-Sama** et **Voiranime**.

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
[SkipIntro] Ready — v1.4.0 — https://www.netflix.com/watch/…
```

## Options (popup)

| Réglage | Effet |
| --- | --- |
| Auto skip intro | Clique intro / recap / opening |
| Auto skip credits | Clique générique / ending / épisode suivant |
| Keep fullscreen between episodes | Empêche la sortie de plein écran au changement d'épisode |
| Floating exclude button | Affiche ou masque le bouton « + » sur le lecteur |
| Delay before click | Attente avant le clic, 0–10000 ms |
| Anime sites · next episode before end | Épisode suivant automatique N s avant la fin, 0–600 s (90 par défaut, 0 = à la fin) ; actif avec « Auto skip credits » |
| Excluded URLs | Pages où l'extension ne fait rien |

Le bouton flottant mint « + » en bas à droite du lecteur ajoute la page courante aux
exclusions en un clic ; il se masque depuis le popup, sans recharger la page.

## Comment ça marche

`content/player.js` observe le DOM et lit un libellé sur chaque bouton visible,
dans cet ordre : `aria-label` (Crunchyroll), `data-uia` (Netflix), puis le texte
visible du bouton (Disney+, Prime Video). Le libellé est normalisé (accents, majuscules) et
classé intro ou générique par mots-clés FR/EN. Pas de branche par plateforme :
ajouter un service = ajouter son sélecteur et ses hôtes.

Le lecteur Disney+ actuel enterre son bouton deux shadow roots plus bas
(`<skip-overlay>` → `<skip-button>` → `<button>`), hors de portée de
`querySelector` : il est récupéré à part dans `listSkipButtons()`.
`button.skip__button` reste là pour l'ancien lecteur en DOM clair.

Prime Video : `.atvwebplayersdk-skipelement-button` (intro / récap) et
`.atvwebplayersdk-nextupcard-button` (épisode suivant), libellés lus dans le texte.
Hôtes : `primevideo.com` et `amazon.{com,fr,co.uk,de,es,it,ca,co.jp}/gp/video/*`.

### Anime-Sama et Voiranime

Pas de bouton « Skip » à cliquer sur ces sites, et chaque clic sur la page peut
ouvrir une pub. `content/anime.js` ajoute donc sa propre barre, en haut au centre
du lecteur (le bas appartient aux sous-titres et aux cartes du lecteur, invisibles
pour la page) : épisode précédent, −10 s, lecture/pause, +10 s, épisode suivant,
plein écran. Après un changement d'épisode, la page demande au nouveau lecteur
de jouer jusqu'à ce qu'il tourne (20 s max ; Chrome refuse le son sans clic
préalable, cas d'un rechargement Voiranime). Elle disparaît après 2,5 s sans mouvement de
souris ; comme la souris sur la vidéo est dans l'iframe du lecteur, invisible
pour la page, le script de l'iframe signale chaque mouvement à la page.

- **Pas de pub** : le script tourne en `document_start`, avant tout script de la
  page, et ses écouteurs `window` en capture arrêtent les clics de la barre avant
  qu'un script de pub ne les voie. Pour les clics sur le site lui-même :
  - le calque invisible de Voiranime (`div` fixe plein écran, opacité 0.01,
    rempli d'un lien de pub) est retiré dès qu'il apparaît ;
  - tout nouvel onglet vers un autre domaine ouvert depuis ces sites est fermé
    par le service worker (`chrome.tabs.onCreated` + `openerTabId`). Bloquer la
    popup dans la page (`window.open` → `null`) a été essayé : le script de pub
    de Voiranime renvoie alors l'onglet en arrière dans l'historique. La fermer
    après coup, il ne le voit pas.
    Seuls les onglets web d'un autre domaine et les onglets vides sont visés :
    le navigateur donne aussi l'onglet courant comme parent à ses propres pages
    (`chrome://extensions`, `brave://newtab`, options d'une extension), qui
    doivent rester ouvertes. `node test/ad-tabs.mjs` vérifie la règle.
- **Vidéo** : elle est dans l'iframe d'un hébergeur tiers ; la barre lui envoie un
  `postMessage`, relayé d'iframe en iframe jusqu'à la `<video>`. Anime-Sama
  change d'hébergeur en permanence (ansembed.net, uqload, miroirs voe aux noms
  aléatoires) : le script est donc injecté dans toutes les iframes, mais le relais
  ne répond que sous une page `anime-sama.*` / `voiranime.*` (via
  `location.ancestorOrigins` sur Chrome).
- **Épisode suivant** : sur Anime-Sama, `selectedIndex++` puis un événement `change`
  sur `#selectEpisodes`, exactement ce que fait le bouton du site, sans clic ;
  en fin de saison, le lien de saison suivante. Sur Voiranime, le lien dont le
  texte est « Suivant » (aucun `rel` ni classe exploitable), suivi en changeant
  `location.href`.
- **Épisode suivant automatique** : l'iframe remonte la position de lecture
  (`timeupdate`, une fois par seconde) ; à 90 s de la fin (réglable), le bouton ⏭
  affiche un compte à rebours de 5 s avec « Annuler », puis change d'épisode.
  Une seule fois par épisode ; revenir en arrière hors du générique l'annule.
- **Voiranime** n'affiche son lecteur qu'après un captcha : la barre apparaît dès
  qu'il y a une liste d'épisodes (`select#episodes`), sans attendre le lecteur.
- **Plein écran** : posé sur le parent de l'iframe, qui reçoit aussi la barre ;
  Anime-Sama remplace l'iframe à chaque épisode mais garde le parent, donc le
  plein écran tient au « Suivant ».

Ces sites changent souvent de domaine : ils sont reconnus au nom, toutes extensions confondues.

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
cliqué, `test/prime-skip.html` les boutons intro et épisode suivant de Prime Video, `test/anime-bar.html` la barre
Anime-Sama, servi via `http://anime-sama.localhost:8765/` (voir l'en-tête du fichier ; attendu `bar=true | seek=10 | back=0 | next_ep=2 | played_after_next=true | ads_fired=0 | countdown=⏭ 5 s | auto_next_ep=3 | prev_ep=2 | ads_fired_end=0`)
(celui-ci attend le cooldown de 2,5 s : `--virtual-time-budget=6000`). Même commande, en changeant le fichier. Attendus :

```
preempt_on_button=true | preempt_on_dblclick=true | ignores_other_click=true |
ignores_exit_click=true | fallback_on_teardown=true | silent_on_user_exit=true |
setting_off=true

intro_clicked=true

intro_clicked=true | next_clicked=true
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

**1.4.0** — Barre de contrôle Anime-Sama / Voiranime (intro, −10 s, plein
écran, épisode suivant, manuel ou automatique avant la fin) qui ne déclenche pas les pubs ; calque de pub invisible
retiré et onglets de pub refermés sur ces sites.

**1.3.0** — Prime Video (skip intro / récap, carte épisode suivant).

**1.2.0** — Plein écran conservé au changement d'épisode (préemption du clic sur
`<html>`, repli fenêtre via service worker), bouton Disney+ retrouvé dans son
shadow DOM.

**1.1.0** — Disney+ (`button.skip__button`, libellé lu dans le texte du bouton),
direction artistique Signal (accent mint, nouvelle icône), option d'affichage du
bouton flottant, version affichée dans le log du content script.

**1.0.0** — Crunchyroll et Netflix, délai avant clic, URLs exclues.
