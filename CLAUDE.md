# Chet & Lys — SvelteKit PWA

Application de couple : Chet (Paris 🇫🇷) + Lys (Phnom Penh 🇰🇭).

## Stack

- **Frontend** : SvelteKit 5 + Svelte 5 runes + TypeScript
- **Déploiement** : Vercel (adapter-vercel), auto-deploy sur push
- **Backend API** : `https://chetana.dev` (Nuxt 3, ne pas toucher)
- **Stockage** : Google Cloud Storage bucket `chet-lys-coffre`
- **Auth** : Google Identity Services (GIS), client ID dans `src/app.html`

## Structure

```
src/
  lib/
    auth.ts        — Google GIS auth, userStore/tokenStore (writable stores)
    api.ts         — API client vers chetana.dev
    compressor.ts  — Compression image Canvas (WebP/JPEG, max 2048px)
    thumbnailer.ts — Thumbnail vidéo via HTMLVideoElement
    semaphore.ts   — Queue async (max 3 signed URL fetches)
    i18n.ts        — Labels FR + Khmer, COUPLE_START, STATUS, REACTIONS
  routes/
    +layout.svelte        — Bottom nav (Horloge / Coffre / Chat)
    horloge/+page.svelte  — Double horloge Paris / Phnom Penh
    coffre/+page.svelte   — Auth gate + navigation hiérarchique
    coffre/components/    — Breadcrumb, YearList, MonthList, DayList,
                            DayNavBar, DaysChipBar, NoteField, FileTile,
                            FabUpload, FileViewer, DayFiles
    chat/+page.svelte     — Chat temps réel : texte 📝, image 📷, vocal 🎤
```

## Conventions

- **Svelte 5 runes** : `$state`, `$derived`, `$effect`, `$props` — pas d'API Options
- **CSS variables** : `--bg`, `--card`, `--accent`, `--text`, `--muted`, `--border`
- **Convention fichiers GCS** : `YYYY/MM/DD/filename`
- **Fichiers méta** : `note.txt`, `meta.json`, `reactions.json` — filtrés de la grille
- **Thème** : dark uniquement, accent rose `#E8A4B8`
- **Bilinguisme** : FR + Khmer partout dans l'UI

## Pièges Svelte 5 (CRITIQUE)

### Réactivité stores legacy dans `$derived`
```typescript
// ❌ FAUX — get(store) dans $derived n'est PAS réactif
const firstName = $derived(auth.getFirstName())

// ✅ CORRECT — syntaxe $store est réactive dans $derived
const firstName = $derived($user?.name.split(' ')[0] ?? '')
```
`userStore` et `tokenStore` sont des Svelte writable stores. Toujours utiliser `$user`, `$token` (syntaxe store auto-subscription) dans `$derived`, jamais `get(store)`.

### CRLF dans +page.svelte
`src/routes/chat/+page.svelte` utilise des fins de ligne **Windows CRLF**.
Les éditions ciblées (Edit tool) fonctionnent bien. Pour les très gros patches, utiliser des scripts Node `.cjs` avec `\r\n` explicites si l'Edit échoue.

## Chat (`/chat`)

- **Messages** stockés dans GCS : `chat/YYYY/MM/DD.json`
- **Images** stockées dans GCS : `YYYY/MM/DD/filename` (même format coffre → sync automatique)
- **Traductions** : chaque message a `fr`, `en`, `kh`, `lang` générés par Gemini
- **Audio** : VAD détecte la voix → base64 → POST `/api/chat/transcribe` → texte + traductions → `source: 'audio'`
- **Suppression** : auteur uniquement (vérifié côté backend)
- **Navigation historique** : `viewOffset` ($state) — 0=aujourd'hui, -1=hier, etc. — boutons ← →
- **Polling** : toutes les 8s (messages du jour uniquement, `if (isToday)`)
- **Heure** : affichée sous chaque bulle — `🇫🇷 hh:mm · 🇰🇭 hh:mm` via `fmtTime()` (Europe/Paris) et `fmtTimeKH()` (Asia/Phnom_Penh)
- **Badge 🎤** : badge `position: absolute` top-right sur `.bubble` (`position: relative`) pour les messages `source: 'audio'`
- **Affichage bulle** : 3 lignes — `msg.text` flaggé (`msg.lang` → 🇫🇷/🇬🇧/🇰🇭) + 2 autres traductions. EN est conditionnel (affiché seulement si `msg.lang !== 'en'`)
- **Copier** : action bar → `copySelected()` copie `[flag] text\n🇫🇷 fr\n[🇬🇧 en\n]🇰🇭 kh` selon `msg.lang`
- **Toast erreur** : `errorToast` ($state), `showError(msg)` — affiché 3s si envoi/image/transcription échoue
- **Toast copie** : `copyToast` ($state) — affiché 2s après copie réussie
- **TTS** : `speakSelected(lang)` → `SpeechSynthesisUtterance` avec `lang` = `fr-FR`/`en-US`/`km-KH` — boutons 🔊🇫🇷/🔊🇬🇧/🔊🇰🇭 en 2ème ligne de l'action bar

### Détection langue utilisateur

```typescript
// ✅ CORRECT — NFD normalization obligatoire pour gérer "Chétana" (compte Google)
function isChet(name: string): boolean {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return n === 'chet' || n === 'chetana'
}
const userLang = $derived<'fr' | 'kh'>(isChet(firstName) ? 'fr' : 'kh')

// ❌ FAUX — "chétana".toLowerCase() === 'chet' → false → Chet traité comme Lys !
// firstName.toLowerCase() === 'chet'
```

### Langue affichée par bulle (`msg.lang`)

```typescript
// Dans {#each messages as msg}
{@const aLang = msg.lang ?? (isChet(msg.author) ? 'fr' : 'kh')}
// Fallback heuristique pour les anciens messages sans champ lang
```

### Suggestion Gemini (`GeminiSuggestion`)

```typescript
interface GeminiSuggestion {
  corrected: string   // texte corrigé dans la langue détectée
  fr: string
  en: string
  kh: string
  lang: string        // langue détectée du message original : 'fr', 'en' ou 'kh'
  question: string    // dans la langue de l'auteur
  lesson?: string     // explication — TOUJOURS dans la langue NATALE de l'auteur
                      // (FR pour Chet, KH pour Lys — quelle que soit la langue écrite)
                      // absent si aucune faute détectée
}
```
La `lesson` (📖 ...) est affichée dans la popup suggestion avec une barre rose à gauche.

### États audio (VAD)

```typescript
let vadLoading = $state(false)  // ⏳ init ONNX en cours
let recording = $state(false)   // ⏹ écoute active (rouge pulsant)
let speaking = $state(false)    // 🔊 voix détectée (vert pulsant)
```

Filtre durée min : segments < 0.8s ignorés (évite les bruits courts).

### Auth-aware loading (éviter race condition)

`auth.init()` dans le layout n'est **pas awaité**. Ne jamais appeler `loadDate()` directement dans `onMount`.

```typescript
let chatInitialized = false;
$effect(() => {
  if ($user && !chatInitialized) {
    chatInitialized = true;
    void loadDate();
  } else if (!$user) {
    chatInitialized = false;
  }
});
```

### VAD configuration production (`vite.config.ts`)

```typescript
optimizeDeps: { exclude: ['@ricky0123/vad-web', 'onnxruntime-web'] },
// viteStaticCopy targets :
{ src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', dest: './' },
{ src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx', dest: './' },
{ src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', dest: './' },
{ src: 'node_modules/onnxruntime-web/dist/*.wasm', dest: './' },
{ src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', dest: './' }, // CRUCIAL
```

Dans `MicVAD.new()` :
```typescript
workletURL: '/vad.worklet.bundle.min.js',
modelURL: '/silero_vad_v5.onnx',
ortConfig: (ort: any) => { ort.env.wasm.wasmPaths = '/'; }, // sinon cherche dans /_app/immutable/chunks/
```

## Workflow dev

```bash
npm run dev          # dev local http://localhost:5173
npm run build        # build production
npm run preview      # preview build local
```

## Déploiement

Push sur `main` → Vercel déploie automatiquement → `chetlys.vercel.app`

## Points clés

- **Auth** : `userStore` (null = non connecté), `auth.init()` dans +layout.svelte
- **Signed URLs** : cache 1h dans `Map<string, string>`, semaphore max 3 concurrent
- **Upload coffre** : FilePicker → compress → signUpload → PUT GCS → saveMeta
- **Upload chat image** : compress → signUpload (path `YYYY/MM/DD/`) → invalidateListCache → sendMessage
- **Deep link** : `/coffre?y=2026&m=02&d=22&f=photo.jpg`
- **Couple ensemble depuis** : 2026-01-13
- **Distance** : 9 074 km, fuseau +6h (Paris → Phnom Penh)
- **FedCM** : `use_fedcm_for_prompt: true` dans `auth.ts` (évite UNSUPPORTED_OS)

## Archive Flutter

Le code Flutter original est conservé dans `app-flutter/` pour référence.
