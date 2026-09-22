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
    server/
      auth.ts           — Vérification token (backend)
      gcs.ts            — Bucket S3 + signed URLs (PUT/GET) — nom hérité de GCS, c'est du S3
      vertex.ts         — Traduction (translate/suggest/transcribe) + leçons/grading
      glm.ts            — Adaptateur GLM-5.3-flash (OpenCode Go), moteur principal pas cher
      translation-issues.ts — journal S3 des incidents de traduction détectés automatiquement
  routes/
    +layout.svelte        — Floating dock 3D (Horloge | Chat | Coffre | Apprendre — 4 tabs)
    horloge/+page.svelte   — Double horloge Paris / Phnom Penh
    coffre/+page.svelte    — Auth gate + navigation hiérarchique
    coffre/components/     — Breadcrumb, YearList, MonthList, DayList, DayNavBar, DaysChipBar,
                             NoteField, FileTile, FabUpload, FileViewer, DayFiles
    chat/+page.svelte      — Chat temps réel : texte 📝, image 📷, vocal 🎤
    apprendre/              — Moteur d'apprentissage FLE (leçons générées, correction IA)
    api/
      chat/               — messages.ts, suggest.ts, transcribe.ts, lessons.ts
      coffre/             — list.ts, sign-upload.ts, sign-download.ts, delete.ts, preview.ts,
                            og-image.ts, note.ts, meta.ts, reactions.ts
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
- **Emoji picker** : bouton 😊 → grille 2 lignes scrollable (40 emojis)
- **Polling** : toutes les 20s, uniquement quand l'onglet est visible ET la fenêtre au premier
  plan (pas de SSE permanent — retiré car ça maintenait un vCPU actif en continu à l'ère
  serverless ; sur chetbox le coût ne bouge plus si on veut un jour repasser en push temps réel).
- **Navigation historique** : `viewOffset` ($state)
- **TTS** : Gemini TTS (`geminiTts` dans `vertex.ts`)
- **Détection auteur** : `isChet(name)` avec NFD normalization (gère "Chétana")
- **XP/flashcards** : `swrXp` (SWR sur `/api/flashcards/progress`) — pour rafraîchir après une
  action côté flashcards, utiliser `swrXp.refresh()` (pas une fonction `loadChatXp` qui n'a jamais
  existé — bug réel trouvé le 22/09, `ReferenceError` au close du panneau flashcards).

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

Moteur principal **GLM-5.3-flash** (pas cher), fallback **Gemini** (`gemini-3.6-flash` /
`gemini-2.5-flash`) sur échec technique ou sortie suspecte. Architecture (refaite le 22/09/2026
après plusieurs bugs réels — voir historique git pour le détail) :

- **System/user séparés** : `buildTranslateSystem(author)` / `buildTranslateUser(text, ctx)` (et
  l'équivalent `buildSuggestSystem`/`buildSuggestUser`) — l'invariant (contexte couple, règles,
  glossaire, schéma JSON) vit dans le system prompt, cacheable côté GLM.
- **Glossaire dans le prompt = formes CIBLES uniquement**, jamais les formes fautives (un petit
  modèle a du mal à pondérer une négation "jamais X" — la chaîne présente dans le prompt devient
  plus probable en sortie, pas moins). Ajouter un mot au glossaire : une seule ligne dans
  `GLOSSARY_LINES` (`vertex.ts`), pas dans 4 endroits différents.
- **Schéma JSON réordonné** : `{"lang", "terms", "en", "kh", "fr"}` — le modèle décide la langue et
  s'engage sur les mots difficiles (`terms`) AVANT de rédiger les phrases ; le code vérifie que
  chaque terme annoncé apparaît bien dans le khmer final (`termsEchoed`).
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
