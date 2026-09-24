# Chet & Lys — SvelteKit PWA

Application de couple : Chet (Paris 🇫🇷) + Lys (Phnom Penh 🇰🇭) — 9 074 km, +6h.

## Stack & déploiement (état réel, 22/09/2026)

- **Frontend** : SvelteKit 2 + Svelte 5 runes + TypeScript
- **Hébergement** : **chetbox**, une VM Scaleway unique toujours allumée (`163.172.7.239`), Docker
  Compose + Caddy (routage par Host header) + PostgreSQL local. **Plus de serverless/Cloud Run** —
  ne pas réintroduire de logique "scale-to-zero" ou de restriction de polling pour économiser du
  CPU serverless, ce n'est plus le modèle de coût (VM = coût fixe).
- **Déployer** : `bash deploy.sh` — bump `APP_VERSION` (+1 patch), `svelte-check` (bloque si erreur),
  build + push l'image Docker taguée par le numéro de version, `ssh` sur chetbox pour
  `docker compose pull && up -d lys`, vérifie `/api/version`, commit+push le bump. **Ne jamais**
  bricoler un tag `pastel-test`/`*-test` à la main pour un test rapide en prod — utiliser
  `deploy.sh` à chaque fois, c'est la seule source de vérité du tag d'image.
- **URL prod** : `https://lys.chetana.fr`
- **Backend intégré** : `src/routes/api/`
- **Stockage** : Object Storage S3-compatible Scaleway, bucket `chet-lys-coffre`, adaptateur dans
  `src/lib/server/gcs.ts` — le nom du fichier/des exports (`getGcsBucket`) date de la migration
  depuis Google Cloud Storage mais c'est bien du S3 (`@aws-sdk/client-s3`) maintenant.
- **Auth** : Logto (`src/lib/auth.ts`, `hooks.server.ts`) + fallback "direct sign-in" Google si pas
  de session (redirect silencieux, sauf liens de partage coffre publics et `/fiancailles`).
- **IA (traductions + leçons)** : `src/lib/server/vertex.ts` + `src/lib/server/glm.ts`.
  **Moteur principal : GLM-5.3-flash** via l'abonnement OpenCode Go (pas cher), **fallback Gemini**
  (Vertex AI) sur échec technique OU sortie khmère suspecte (script étranger, latin corrompu collé,
  forme JSON invalide). Voir "Traduction" plus bas — c'est la partie la plus retravaillée du repo.

## Garde-fous (réparés le 22/09/2026 — ne pas les recasser)

- **Hook pre-commit** (`.claude/hooks/pre-commit-check.sh`, déclenché sur tout `Bash` matchant
  `git ... commit`) : bloque le commit si `svelte-check --threshold error` échoue. Doit rester en
  **LF** (`.gitattributes` force `*.sh text eol=lf`) — il a tourné cassé en CRLF pendant des mois
  sans jamais bloquer un seul commit, personne ne s'en était rendu compte.
- **`deploy.sh`** lance aussi `svelte-check` + `vitest` avant de builder l'image — un échec arrête
  le déploiement avant de pousser en prod.
- **CI GitHub Actions** (`.github/workflows/ci.yml`, `check` : `npm run check` + `npm run test`) —
  signal visible sur chaque push/PR, pas un gate qui bloque un merge (repo perso, un seul dev).
  Volontairement **sans Playwright ni `eval:translate`** : ces deux-là tapent de vraies
  infra/secrets (S3, Postgres, Logto, GLM/Vertex) et coûtent de vrais appels — à lancer à la main,
  jamais avec de vrais secrets exposés à un repo public.
- **Skill `/pre-deploy`** (`.claude/skills/pre-deploy/SKILL.md`) — checklist d'auto-vérification
  (pas un agent) à parcourir avant `/deploy` : quels tests/scripts relancer selon les fichiers
  touchés (traduction → `eval:translate`, layout/CSS → smoke test nav-dock, auth-gate → smoke test
  auth-gate, nouvelle route publique → validation de path).
- Avant de considérer un changement "fini" : `npm run check` doit être à 0 erreur. Les warnings a11y
  préexistants (FabUpload, FileViewer, DayFiles, fiancailles) sont connus, pas bloquants.

## Structure

```
src/
  lib/
    auth.ts           — Logto + fallback Google direct sign-in, userStore/tokenStore
    api.ts             — API client (BASE='', routes SvelteKit locales)
    swr.svelte.ts       — utilitaire SWR maison (Svelte 5 runes) — typer explicitement T sur
                          createSWR<T>(...) si getCached() renvoie unknown, sinon toutes les
                          dérivées de swr.data deviennent unknown (piège vécu le 22/09)
    compressor.ts       — Compression image Canvas (WebP/JPEG, max 2048px)
    thumbnailer.ts      — Thumbnail vidéo via HTMLVideoElement
    semaphore.ts        — Queue async (max 3 signed URL fetches)
    i18n.ts             — Labels FR + Khmer, COUPLE_START, STATUS, REACTIONS
    sky.ts              — Mécanisme pur du ciel Paris/Phnom Penh (paliers 3h interpolés en
                          continu, phase lunaire) — extrait de Sky.svelte, testé, réutilisé par
                          l'horloge pour ses cartes "fenêtres sur le ciel local"
    LangTag.svelte      — Étiquette typographique de langue (FR/EN/ខ្មែរ) — remplace Flag.svelte
                          comme marqueur de LANGUE (Flag reste pour un LIEU : horloge, double
                          horodatage Paris/PP du chat)
    BottomSheet.svelte  — Sheet claire avec poignée (voile clair, pas de backdrop noir),
                          généralisée depuis Apprendre — coffre (upload) l'utilise aussi
    chat/group.ts       — groupMessages() : regroupe les messages consécutifs du même auteur
                          (<5min d'écart) sous un seul avatar/horodatage
    server/
      auth.ts           — Vérification token (backend)
      gcs.ts            — Bucket S3 + signed URLs (PUT/GET) — nom hérité de GCS, c'est du S3
      coffre-path.ts    — Validation pure des path/prefix S3 coffre (isValidCoffrePath/Prefix,
                          isValidCoverPrefix, isMediaFile, isImageFile) — bucket partagé avec
                          chat/apprendre/translation-issues, jamais de path/prefix libre
      vertex.ts         — Traduction (translate/suggest/transcribe) + leçons/grading
      glm.ts            — Adaptateur GLM-5.3-flash (OpenCode Go), moteur principal pas cher
      khmer-guards.ts   — Fonctions pures de traduction (validation, anti-corruption, prompts)
      translation-issues.ts — journal S3 des incidents de traduction détectés automatiquement
      rate-limit.ts     — Décision pure de rate-limit (fenêtre glissante), utilisée par hooks.server.ts
  routes/
    +layout.svelte        — Floating dock (Horloge | Chat | Coffre | Apprendre — 4 tabs, bilingue
                            FR+khmer sur les labels), icônes lucide, Sky visible en transparence
    horloge/+page.svelte   — Double horloge Paris / Phnom Penh, cartes = fenêtres sur le ciel local
    coffre/+page.svelte    — Auth gate + navigation hiérarchique
    coffre/components/     — Breadcrumb (titre contextuel + retour), YearList/MonthList (photo de
                            couverture en fond de carte), DayList/DayTile (vignette photo du jour,
                            appareil photo barré si vide — remplace l'ancien DayFlower), DayNavBar,
                            DaysChipBar, NoteField, FileTile, FabUpload (BottomSheet), FileViewer,
                            DayFiles
    chat/+page.svelte      — Chat : texte, image, vocal, messages regroupés (chat/group.ts)
    chat/components/       — ChatBubble (trilingue repliable, tap ouvre BubbleMenu), BubbleMenu
                            (réagir/écouter/copier/supprimer, remplace l'ancienne colonne de
                            boutons), ChatInput, SuggestionCard, ChatToast
    apprendre/              — Moteur d'apprentissage FLE (leçons générées, correction IA), pastel
    api/
      chat/               — messages.ts, suggest.ts, transcribe.ts, lessons.ts
      coffre/             — list.ts, cover.ts (photo de couverture année/mois), sign-upload.ts,
                            sign-download.ts, delete.ts, preview.ts, og-image.ts, note.ts,
                            meta.ts, reactions.ts
```

## Conventions

- **Svelte 5 runes** : `$state`, `$derived`, `$effect`, `$props` — pas d'API Options
- **CSS variables** : voir `src/app.css` (`--bg`, `--surface`, `--accent`, `--accent-deep`,
  `--text`, `--muted`, `--border`, `--lavender*`, `--gold*`) — **thème pastel unique, toujours
  actif** depuis le 22/09/2026 (remplace l'ancien thème sombre "Sakura" + le thème saisonnier
  "eau" du Nouvel An Khmer qui restait figé à `true` toute l'année — les deux ont été supprimés,
  ne pas les réintroduire).
- **Convention fichiers S3** : `YYYY/MM/DD/filename`
- **Fichiers méta** : `note.txt`, `meta.json`, `reactions.json` — filtrés de la grille
- **Bilinguisme** : FR + Khmer partout dans l'UI. Le khmer est une langue **première**, jamais
  secondaire (plan de modernisation P0/P1, 22/09/2026) :
  - **jamais `--accent` (#FF9EB3) en couleur de texte** — c'est une couleur de surface. Texte
    accentué = `--accent-text` (alias de `--accent-deep`). Piège vécu : l'heure de l'horloge,
    l'année du coffre, plusieurs boutons/badges avaient un texte rose sur blanc à ~2:1 de contraste.
  - **jamais `font-style: italic` sur du khmer** — Noto Sans Khmer n'a pas d'italique réelle,
    l'oblique synthétique abîme les diacritiques empilés. Une règle globale
    `:lang(km), .kh { font-style: normal; line-height: var(--lh-kh) }` rattrape les oublis, mais
    mettre `lang="km"` sur tout texte khmer rendu.
  - taille khmer ≥ `--fs-base` (13px), jamais `--fs-xs`/`--fs-sm` ; `--lh-kh: 1.6` minimum.
  - une seule atténuation visuelle (couleur `--muted` OU `opacity`, jamais les deux empilées).
- **Polices** : Inter + Fredoka (titres/labels) + Noto Sans Khmer — Google Fonts, chargées dans
  `src/app.html`
- **Iconographie** : `lucide-svelte` uniquement (stroke 1.75-2, `size` en px) — plus d'emoji comme
  icône système (🔔, 🎴, glyphes unicode ◂▸...) ni de SVG custom animés en boucle. Les emojis
  restent légitimes comme **contenu** (réactions de chat, `i18n.ts`), jamais comme icône d'action.
- **Motion** : au changement d'état uniquement, jamais d'animation `infinite` ambiante — Sky est la
  seule "vie" permanente de l'écran. Piège vécu : plusieurs `animation: ... infinite` cumulées
  (pulse de l'heure, cœurs volants, icônes du dock) sur un même écran.

## Navigation — Floating dock 3D

Ordre des tabs : **Horloge | Chat | Coffre | Apprendre**. `Sky.svelte` (fond animé, dégradé
Paris/Phnom Penh selon l'heure réelle) est en `position: fixed; z-index: 0` — **tout élément qui
doit rester lisible par-dessus doit avoir son propre `position: relative` + `z-index` explicite**
(header, main, nav-dock l'ont ; c'est un piège récurrent — le nav-dock a été oublié pendant tout le
refactor pastel du 22/09, rendant le badge de version invisible sans qu'aucun log n'explique
pourquoi).

## Pièges Svelte 5 (CRITIQUE)

### Réactivité stores legacy dans `$derived`
```typescript
// ❌ FAUX — get(store) dans $derived n'est PAS réactif
const firstName = $derived(auth.getFirstName())

// ✅ CORRECT — syntaxe $store est réactive dans $derived
const firstName = $derived($user?.name.split(' ')[0] ?? '')
```

### CRLF dans chat/+page.svelte
`src/routes/chat/+page.svelte` est en Windows CRLF (volontaire, pas une erreur — voir
`.gitattributes`). Les éditions ciblées (Edit tool) fonctionnent. Pour de très gros patches,
utiliser des scripts Node `.cjs` avec `\r\n` explicites.

### `createSWR<T>` : toujours vérifier le type de retour du getter de cache
Si `getCached(key)` a un type de retour flou (`unknown`, pas de type explicite), TypeScript infère
`T = unknown` pour tout le hook, et **toutes** les dérivées de `swr.data` deviennent `unknown` sans
erreur visible avant `npm run check`. Vécu le 22/09 sur `getCachedList` (`src/lib/api.ts`) qui
appelait un getter générique typé `unknown | null` dans `localCache.ts` — 22 erreurs en cascade sur
4 fichiers, corrigées par un seul cast de retour `ListResult | null` sur le wrapper exporté.

## Chat (`/chat`)

- **Messages** : S3 `chat/YYYY/MM/DD.json`
- **Images** : S3 `YYYY/MM/DD/filename` (sync auto coffre)
- **Traductions** : `fr`, `en`, `kh`, `lang` — voir section "Traduction" ci-dessous
- **Audio** : VAD (Silero, `@ricky0123/vad-web` 0.0.30) → base64 WAV → POST
  `/api/chat/transcribe` → GLM/Gemini. **Options réelles de `MicVAD.new()` dans cette version** :
  `baseAssetPath` (préfixe combiné à des noms de fichiers fixes) + `model: 'v5'|'legacy'` — PAS
  `workletURL`/`modelURL`/`additionalAudioConstraints`, qui n'existent pas dans le type
  `RealTimeVADOptions` et étaient silencieusement ignorés (bug trouvé le 22/09 : le modèle
  chargé était "legacy" par défaut, pas "v5" comme l'intention du code le suggérait).
- **Emoji picker** (`EmojiPanel.svelte`, refait le 24/09/2026) : bouton 😊 → panneau vertical
  (molette/doigt) de tous les emojis Unicode par catégorie (`src/lib/emoji-data.ts`, généré depuis
  `emoji-test.txt` officiel, sans variantes de teint, chargé par import dynamique), onglets lucide,
  récents par appareil (`localStorage`, favoris du couple par défaut). Les emojis de version > 15.0
  sont testés à l'exécution (canvas : couleur + largeur d'un seul glyphe) et masqués si l'appareil
  ne sait pas les dessiner. **Se referme au choix d'un emoji, au tap ailleurs et à Échap** (demande
  explicite de Chetana : ne jamais rester ouvert par oubli). Remplace l'ancienne bande horizontale
  de 40 emojis, que la molette ne faisait pas défiler sur ordinateur.
- **Polling** : toutes les 20s, uniquement quand l'onglet est visible ET la fenêtre au premier
  plan (pas de SSE permanent — retiré car ça maintenait un vCPU actif en continu à l'ère
  serverless ; sur chetbox le coût ne bouge plus si on veut un jour repasser en push temps réel).
- **Navigation historique** : `viewOffset` ($state)
- **TTS** : Gemini TTS (`geminiTts` dans `vertex.ts`)
- **Détection auteur** : `isChet(name)` avec NFD normalization (gère "Chétana")
- **XP/flashcards** : `swrXp` (SWR sur `/api/flashcards/progress`) — pour rafraîchir après une
  action côté flashcards, utiliser `swrXp.refresh()` (pas une fonction `loadChatXp` qui n'a jamais
  existé — bug réel trouvé le 22/09, `ReferenceError` au close du panneau flashcards).
- **Bulles** (`ChatBubble.svelte`, refonte 23/09/2026) : messages regroupés par `chat/group.ts`
  (même auteur, <5min d'écart → un seul avatar/horodatage). Traductions secondaires repliées par
  défaut, révélées au tap (langue du lecteur affichée en premier, jamais un ordre FR figé). Le tap
  sur la bulle ouvre `BubbleMenu.svelte` (réagir/écouter/copier/supprimer) — **au tap direct, pas
  au long-press** (testé en long-press ~450ms pendant la refonte, repassé au tap sur demande
  explicite de Chetana : un tap simple ne faisait rien d'autre avant, plus intuitif à l'usage).
  Le menu s'ouvre **sur le côté de la bulle** (à gauche des miennes, à droite des siennes), en
  colonne étroite flottante — pas dessous : la maquette P7 le mettait sous la bulle, Chetana a
  demandé le 24/09/2026 de revenir au côté comme l'ancienne colonne d'actions. Il flotte en
  surimpression (la bulle ne rétrécit pas) et se recale seul dans `.message-list` s'il déborde.
  Fermeture au tap n'importe où ailleurs (écouteur `pointerdown` global, en-tête/saisie/dock
  compris) ou après une action.

### Race condition auth
`auth.init()` n'est **pas awaité** dans le layout. Ne jamais appeler `loadDate()` dans `onMount`.
```typescript
let chatInitialized = false;
$effect(() => {
  if ($user && !chatInitialized) { chatInitialized = true; void loadDate(); }
  else if (!$user) { chatInitialized = false; }
});
```

### Mise à jour PWA / version
`checkVersion()` dans `+layout.svelte` compare `/api/version` (serveur) à `APP_VERSION`
(`src/lib/version.ts`, bumpé par `deploy.sh`) au montage **+ toutes les 5 min + au retour au
premier plan** (réactivé le 22/09 — supprimé à tort à l'ère serverless pour ne pas maintenir le
container éveillé, obsolète sur chetbox). Si le service worker a une nouvelle version en attente,
`SKIP_WAITING` + `location.reload()`, garde-fou anti-boucle via `sessionStorage.updatedTo`.

## Traduction (GLM + Gemini) — `src/lib/server/vertex.ts` + `glm.ts`

Moteur principal **GLM-5.3-flash** (pas cher), fallback **Gemini** (`gemini-3.6-flash` puis
`gemini-3.5-flash` ; escalade sur `3.5-flash` d'abord) sur échec technique ou sortie suspecte.
TTS : `gemini-2.5-flash-tts` (GA). Leçons/grading : encore `gemini-2.5-flash-lite` (retiré le
28/01/2027 — candidat `3.1-flash-lite`, à valider sur la génération de leçons, pas seulement la
traduction). **Changer de modèle = passer d'abord `scripts/bench-gemini-models.mjs`** (même prompt,
mêmes garde-fous que la prod, protocole pronoms avec contexte biaisant) — jamais la table de
migration de Google telle quelle. Architecture (refaite le 22/09/2026 après plusieurs bugs réels —
voir historique git pour le détail) :

- **System/user séparés** : `buildTranslateSystem(author)` / `buildTranslateUser(text, ctx)` (et
  l'équivalent `buildSuggestSystem`/`buildSuggestUser`) — l'invariant (contexte couple, règles,
  glossaire, schéma JSON) vit dans le system prompt, cacheable côté GLM.
- **Glossaire structuré** (`GLOSSARY` dans `khmer-guards.ts`, refait le 24/09/2026) : un tableau
  typé `{line, src, kh?, fr?, en?, authorIsChet?, direction?}` plutôt qu'un bloc de texte — `line`
  alimente le prompt (`GLOSSARY_LINES` fr/en→kh, `GLOSSARY_KH_LINES` kh→fr/en, dédupliquées), les
  regex `src`/`kh`/`fr`/`en` alimentent `glossaryEchoed()`, un garde-fou qui lit la SOURCE
  directement — contrairement à `termsEchoed` (ci-dessous), il ne dépend PAS du modèle pour choisir
  d'annoncer un terme. Toujours des formes CIBLES uniquement, jamais les formes fautives (un petit
  modèle pondère mal une négation "jamais X" — la chaîne présente dans le prompt devient plus
  probable en sortie, pas moins). Ajouter un mot : une seule entrée dans `GLOSSARY`.
- **Schéma JSON réordonné** : `{"lang", "terms", "en", "kh", "fr"}` — le modèle décide la langue et
  s'engage sur les mots difficiles (`terms`, avec `fr`/`en` en plus si le mot difficile est en
  khmer) AVANT de rédiger les phrases ; le code vérifie que chaque terme annoncé apparaît bien dans
  le khmer/fr/en final (`termsEchoed`).
- **`numbersPreserved`** (`khmer-guards.ts`) : vérifie qu'une heure/montant/quantité de la source
  ressort dans le khmer en chiffres (arabes ou khmers, équivalent 12h accepté) — bug réel du 24/09,
  "vers 22h" rendu "8h"/"11h" en khmer sur ~1/3 des essais, jamais en fr/en dans la même génération.
- **Bug réel du 24/09/2026 — mots tendres non couverts dans le sens inverse** : le glossaire ne
  couvrait que fr/en→kh pour des mots isolés (allergie, sésame...), jamais kh→fr/en ni les formules
  composées (salutation+surnom). "Bonjour ma chérie" collé à une heure faisait halluciner le khmer
  un mot bidon (`ចង្អុរ`/`ច្បាស់`/`ចង្អុល`...) sur 5/6 essais, et `ប្ដីសម្លាញ់` perdait "mari" en
  français sur la moitié des essais. Fixé par : glossaire bidirectionnel (mots tendres fr→pronom kh
  ET mots composés kh→fr/en), règle positive "un verbe français = un verbe khmer" (tuait un cadrage
  "chercher" parasite sur "se remettre à un sport"), règle de conservation des nombres. Vérifié par
  reproduction (6 essais/cas) : 1/6 → 6/6 correct sur les 3 cas après fix. Cas de non-régression
  dans `scripts/translate-cases.mjs`.
- **Bug réel du 24/09/2026 après-midi — le modèle "en rajoutait dans le tendre"** : "je suis
  content" traduit "je t'aime très fort", "darling" ajouté, "notre petit" pour le bébé d'un ami, et
  le "oui" de Chet rendu `ចា៎ស` (le oui féminin) **6 fois sur 6**. Fixé par : "oui" selon le genre de
  l'auteur (ligne d'auteur de `coupleContext`), règle "mots tendres fidèles à la source", règle "mot
  khmer courant plutôt qu'un mot composé" (GLM inventait des mots pour "s'ennuyer"), glossaire avec
  champ `avoid` (formes interdites vérifiées par le code, jamais montrées au modèle), et deux
  garde-fous déterministes : **`tendernessAdded`** (mot tendre / "je t'aime" absent de la source
  fr/en) et **`pronounSwapped`** (pronom de l'autre dans une phrase fr/en qui ne parle que de soi —
  ni "tu/toi/vous" ni mot tendre ; attention aux faux amis `បង្ហាញ`/`បងប្អូន`/`ប្អូន`). Mesuré :
  12/30 → 30/30 sur ces cas, et **1 escalade sur 87** traductions à l'éval complète (une vraie
  erreur) — GLM reste le moteur de ~99 % des messages.
- **`GLM_ADAPT` vit dans `khmer-guards.ts`** (réexporté par `glm.ts`) : avant le 24/09/2026,
  `eval-translate.mjs` testait GLM **sans** ce bloc, donc pas avec le prompt exact de prod.
- **Éval** : `npm run eval:translate -- --runs 6 --only "<nom>"` répète/filtre les cas, et affiche
  le taux d'escalade vers Gemini que la prod aurait déclenché (`⤴`) — un garde-fou qui escalade des
  traductions correctes coûte cher, le vérifier avant tout nouveau garde-fou.
- **Validation de forme** (`pickTranslation`/`pickSuggestion`) : rejette placeholder recopié, champ
  vide, khmer identique au français/anglais — antérieurement une sortie "valide JSON mais fausse"
  passait sans broncher.
- **Escalade** : léger (GLM/COUPLE_MODELS) → si corruption détectée (script étranger, latin collé
  SANS espace au milieu d'un mot khmer type "បុortonexus") OU échec de forme → escalade DIRECTE
  vers Gemini fort **en bypassant GLM** (jamais un simple retry du même moteur, qui reproduirait la
  même erreur). Si l'escalade échoue aussi → `translateInChunks` (découpage phrase par phrase),
  dernier recours seulement, et **toujours journalisé** (`translation-issues.ts`) — plus de
  fallback silencieux qui renvoyait le texte source déguisé en khmer.
- **Anti-hallucination sémantique** : règle explicite contre le fait de spécialiser un terme vague
  de la source (surtout vers du sexuel/physique) sans justification claire dans le texte — bug réel
  trouvé le 22/09 sur "ការធ្វើថ្មី" (littéralement "ce que tu as fait de nouveau", très générique)
  traduit à tort en "mes caresses".
- **Journal S3** : `translation-issues/YYYY/MM/DD/*.json` — relu via le skill
  `lys-translation-review` (`chet-workspace/home-claude/skills/`), qui propose des ajouts au
  glossaire à valider avant de les committer, jamais appliqués automatiquement.

## Coffre (`/coffre`)

- Navigation hiérarchique : Années → Mois → Jours → Fichiers
- Deep link : `/coffre?y=2026&m=02&d=22&f=photo.jpg`
- Upload FAB : compress → signUpload → PUT S3 → saveMeta → invalidateListCache
- Signed URLs : cache 1h, semaphore max 3 concurrent

## Env vars

Secrets injectés via `infra/box/env/*.env` sur chetbox (jamais commités). Voir
`chet-workspace/MIGRATION-BOX.md` pour l'inventaire complet des secrets (Cloudflare, S3, GLM/
OpenCode, Vertex, Logto...).

## Workflow dev

```bash
npm run dev            # http://localhost:5173
npm run build          # build production
npm run preview        # preview build local
npm run check          # svelte-check — doit être à 0 erreur avant de committer
npm run test           # vitest — unitaire/intégration, mocké, aucun secret requis
npm run test:e2e       # playwright — smoke tests (e2e/), tape un vrai serveur dev + vraies infra,
                       # jamais en CI. Voir e2e/README.md.
npm run eval:translate # rejoue les cas de régression de traduction + réplique de vrais messages
                       # (--replay N), coûte de vrais appels GLM/Gemini, jamais en CI.
```

## Archive Flutter

Code original Flutter dans `app-flutter/` (120 MB, non versionné — voir `.gitignore`).
