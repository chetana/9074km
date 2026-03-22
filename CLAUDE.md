# Chet & Lys — SvelteKit PWA

Application de couple : Chet (Paris 🇫🇷) + Lys (Phnom Penh 🇰🇭) — 9 074 km, +6h.

## Stack

- **Frontend** : SvelteKit 5 + Svelte 5 runes + TypeScript
- **Déploiement** : Cloud Run (`lys`, europe-west1) — `gcloud run deploy lys --source . --env-vars-file envvars.yaml`
- **URL prod** : `https://lys-267131866578.europe-west1.run.app` / `https://lys.chetana.dev`
- **Backend intégré** : `src/routes/api/` (plus de dépendance à chetana.dev)
- **Stockage** : Google Cloud Storage bucket `chet-lys-coffre`
- **Auth** : Google Identity Services (GIS), client ID dans `src/app.html`
- **IA** : Vertex AI / Gemini via `src/lib/server/vertex.ts`

## Structure

```
src/
  lib/
    auth.ts           — Google GIS auth, userStore/tokenStore (writable stores)
    api.ts            — API client (BASE='', routes SvelteKit locales)
    compressor.ts     — Compression image Canvas (WebP/JPEG, max 2048px)
    thumbnailer.ts    — Thumbnail vidéo via HTMLVideoElement
    semaphore.ts      — Queue async (max 3 signed URL fetches)
    i18n.ts           — Labels FR + Khmer, COUPLE_START, STATUS, REACTIONS
    server/
      auth.ts         — Vérification token Google (backend)
      gcs.ts          — GCS bucket + signed URLs (PUT/GET)
      vertex.ts       — Gemini : translate, suggest, transcribe
  routes/
    +layout.svelte        — Floating dock 3D (Horloge | Chat | Coffre)
    horloge/+page.svelte  — Double horloge Paris / Phnom Penh
    coffre/+page.svelte   — Auth gate + navigation hiérarchique
    coffre/components/    — Breadcrumb, YearList, MonthList, DayList,
                            DayNavBar, DaysChipBar, NoteField, FileTile,
                            FabUpload, FileViewer, DayFiles
    chat/+page.svelte     — Chat temps réel : texte 📝, image 📷, vocal 🎤
    api/
      chat/             — messages.ts, suggest.ts, transcribe.ts, lessons.ts
      coffre/           — list.ts, sign-upload.ts, sign-download.ts,
                          delete.ts, preview.ts, og-image.ts, note.ts,
                          meta.ts, reactions.ts
```

## Conventions

- **Svelte 5 runes** : `$state`, `$derived`, `$effect`, `$props` — pas d'API Options
- **CSS variables** : `--bg`, `--card`, `--accent`, `--accent-warm`, `--text`, `--muted`, `--border`
- **Convention fichiers GCS** : `YYYY/MM/DD/filename`
- **Fichiers méta** : `note.txt`, `meta.json`, `reactions.json` — filtrés de la grille
- **Thème** : dark/light, accent rose sakura `#F2A0B0` → eau teal `#58C4DC` (Nouvel An Khmer)
- **Bilinguisme** : FR + Khmer partout dans l'UI
- **Polices** : Inter (latin) + Noto Sans Khmer — Google Fonts variable

## Thème Nouvel An Khmer (eau 💧)

Actif via classe `.khmer-new-year` sur `.app` (actuellement forcé à `true` en avance).
Désactiver en remettant la condition date dans `+layout.svelte` :
```typescript
const isKhmerNewYear = $derived(() => {
  const m = now.getMonth(); const d = now.getDate();
  return m === 3 && d >= 1 && d <= 20; // 1–20 avril
});
```
- Override couleurs : `--accent: #58C4DC`, `--bg: #0B1A28`, etc.
- 3 blobs caustiques animés (12s/16s/20s) via `.water-bg`
- Zone dock : texture glaçon CSS (grain SVG `feTurbulence` + facettes diagonales)

## Navigation — Floating dock 3D

Ordre des tabs : **Horloge | Chat | Coffre** (Chat au centre = index 1).
Effet 3D : `perspective: 560px` sur la nav, `--offset` par tab :
- Actif (offset 0) : `rotateY(0) translateZ(22px) scale(1.03)` → pop vers l'avant
- Inactifs : `rotateY(offset * -20deg) translateZ(-5px)` → reculent et s'inclinent

## Pièges Svelte 5 (CRITIQUE)

### Réactivité stores legacy dans `$derived`
```typescript
// ❌ FAUX — get(store) dans $derived n'est PAS réactif
const firstName = $derived(auth.getFirstName())

// ✅ CORRECT — syntaxe $store est réactive dans $derived
const firstName = $derived($user?.name.split(' ')[0] ?? '')
```

### CRLF dans chat/+page.svelte
`src/routes/chat/+page.svelte` est en Windows CRLF.
Les éditions ciblées (Edit tool) fonctionnent. Pour de très gros patches, utiliser des scripts Node `.cjs` avec `\r\n` explicites.

## Chat (`/chat`)

- **Messages** : GCS `chat/YYYY/MM/DD.json`
- **Images** : GCS `YYYY/MM/DD/filename` (sync auto coffre)
- **Traductions** : `fr`, `en`, `kh`, `lang` générés par Gemini
- **Audio** : VAD (Silero) → base64 WAV → POST `/api/chat/transcribe` → Gemini
- **Emoji picker** : bouton 😊 → grille 2 lignes scrollable (40 emojis)
- **Polling** : 8s (aujourd'hui uniquement)
- **Navigation historique** : `viewOffset` ($state)
- **TTS** : Web Speech API — boutons 🔊🇫🇷/🔊🇬🇧/🔊🇰🇭
- **Détection auteur** : `isChet(name)` avec NFD normalization (gère "Chétana")

### Race condition auth
`auth.init()` n'est **pas awaité** dans le layout. Ne jamais appeler `loadDate()` dans `onMount`.
```typescript
let chatInitialized = false;
$effect(() => {
  if ($user && !chatInitialized) { chatInitialized = true; void loadDate(); }
  else if (!$user) { chatInitialized = false; }
});
```

### VAD production (`vite.config.ts`)
```typescript
optimizeDeps: { exclude: ['@ricky0123/vad-web', 'onnxruntime-web'] },
// Copier via viteStaticCopy : worklet, silero_vad_v5.onnx, *.wasm, ort-wasm-simd-threaded.mjs
// Dans MicVAD.new() : ortConfig: (ort) => { ort.env.wasm.wasmPaths = '/'; }
```

## Coffre (`/coffre`)

- Navigation hiérarchique : Années → Mois → Jours → Fichiers
- Deep link : `/coffre?y=2026&m=02&d=22&f=photo.jpg`
- Upload FAB : compress → signUpload → PUT GCS → saveMeta → invalidateListCache
- Signed URLs : cache 1h, semaphore max 3 concurrent

## Vertex AI / Gemini

`src/lib/server/vertex.ts` :
- Modèles : `gemini-3-flash-preview` (primaire) → `gemini-2.5-flash` (fallback)
- **CRITIQUE** : toujours `thinkingConfig: { thinkingBudget: 0 }` sinon thinking=parts[0]
- Endpoints Gemini 3.x : global (`aiplatform.googleapis.com/.../locations/global/...`)
- `coupleContext(author?)` : injecté dans les 3 fonctions, précise genre/pronoms

## GCS / Env vars

`GCS_SERVICE_ACCOUNT_JSON` en YAML gcloud : literal `\n` (backslash+n, 2 chars).
Fix : parser state-machine dans `gcs.ts` et `vertex.ts` qui strip les `\n` hors des strings JSON.
`GCS_BUCKET_NAME` : `.replace(/\\n/g, '').trim()` obligatoire.

## Déploiement

```bash
# Générer envvars.yaml depuis .env (script Node qui gère virgules dans JSON)
node gen-envvars.cjs

# Déployer
gcloud run deploy lys --source . --env-vars-file envvars.yaml \
  --region europe-west1 --project cykt-399216 --allow-unauthenticated
```

**Ne jamais committer** `.env` ni `envvars.yaml`.

## Workflow dev

```bash
npm run dev      # http://localhost:5173
npm run build    # build production
npm run preview  # preview build local
```

## Archive Flutter

Code original Flutter dans `app-flutter/` (120 MB, non versionné — voir `.gitignore`).
