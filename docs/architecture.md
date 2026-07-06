# Architecture — chet_lys (SvelteKit)

> Migration Flutter → SvelteKit effectuée en février 2026.
> L'app Flutter originale est conservée dans `app-flutter/` pour référence.

## Vue d'ensemble

Application couple **PWA** avec deux onglets : une double horloge (stateless) et un coffre à souvenirs (backend GCS via chetana.dev).

**Stack** : SvelteKit 2 · Svelte 5 · TypeScript · Vite · Vercel (adapter-vercel)

---

## Structure du code

```
src/
├── app.css                    # Variables CSS globales (thème sombre #0F0F1A)
├── app.html                   # Template HTML racine (PWA meta tags)
├── lib/
│   ├── api.ts                 # Appels REST vers chetana.dev (coffre + chat)
│   ├── auth.ts                # Auth Google (GSI One Tap, sessionStorage)
│   ├── compressor.ts          # Compression images canvas WebP/JPEG avant upload
│   ├── i18n.ts                # Constantes bilingues FR+KH, statuts, dates
│   ├── semaphore.ts           # Semaphore async (max 3 signDownload simultanés)
│   └── thumbnailer.ts         # Thumbnail vidéo via HTMLVideoElement + Canvas
│
└── routes/
    ├── +layout.svelte         # Shell app : bottom nav + icône horloge dynamique
    ├── +page.svelte           # Redirect / → /horloge
    ├── horloge/
    │   └── +page.svelte       # Double horloge Paris/Phnom Penh + compteur jours
    ├── coffre/
    │   ├── +page.ts           # load() : lit les query params deep link (y, m, d, f)
    │   ├── +page.svelte       # Auth gate + navigation state-based
    │   └── components/
    │       ├── Breadcrumb.svelte    # Coffre › 2026 › 02 › 22
    │       ├── YearList.svelte      # Liste des années + compteur mois
    │       ├── MonthList.svelte     # Liste des mois FR+KH + compteur jours
    │       ├── DayList.svelte       # Liste des jours + compteur fichiers
    │       ├── DayFiles.svelte      # Vue jour : grille + viewer + upload
    │       ├── DayNavBar.svelte     # ‹ label › [zoom]
    │       ├── DaysChipBar.svelte   # Chips jours avec compteur, auto-scroll
    │       ├── NoteField.svelte     # Note pliable du jour, auto-save
    │       ├── FileTile.svelte      # Tuile grille (image/vidéo + badges)
    │       ├── FabUpload.svelte     # Bouton upload + progression 2 phases
    │       └── FileViewer.svelte    # Viewer plein écran (swipe + réactions)
    └── chat/
        └── +page.svelte       # Chat complet : texte, image, vocal, TTS
```

---

## Navigation Coffre

Navigation **state-based** dans `+page.svelte` (pas de router) :

```
year === null  → YearList
month === null → MonthList(year)
day === null   → DayList(year, month)
else           → DayFiles(year, month, day)
```

```
Breadcrumb :  Coffre › 2026 › 02 › 22
                ↑tap    ↑tap  ↑tap  (niveau actif)
```

Deep link à l'ouverture : `?y=2026&m=02&d=22&f=photo.jpg` → navigation directe.

---

## DayFiles — composants internes

```
DayFiles
├── DayNavBar          label · ‹ › · [zoom colonnes]
├── DaysChipBar        chips jours avec compteur, auto-scroll
├── NoteField          note pliable, auto-save onblur
├── Grille (grid CSS)
│   └── FileTile × N
│       ├── img src = og-image proxy ?w=300 (jamais l'original)
│       ├── Badge bas-gauche : prénomUploader (meta.json)
│       └── Badge bas-droit  : emojis réactions (reactions.json)
├── FabUpload          ✨ compressing X/N · ⏳ uploading X/N
└── FileViewer (overlay plein écran)
    ├── swipe entre photos du jour
    ├── Barre top : close · filename · 🔗 link · share
    ├── Barre bottom : réactions ❤️ 😍 😂 🥹 🔥 👏
    └── Toast "Copié · ចម្លង"
```

---

## Flux de données — Coffre

```
auth.ts → Google GSI One Tap → JWT → sessionStorage

api.ts (Bearer JWT sur tous les appels)
├── listObjects(prefix)       GET  /api/coffre/list?prefix=
├── signUpload(path, ct)      GET  /api/coffre/sign-upload?path=&contentType=
├── uploadFile(url, bytes)    PUT  <signed_url> (direct GCS)
├── signDownload(path)        GET  /api/coffre/sign-download?path=
├── deleteObject(path)        DELETE /api/coffre/delete?path=
├── fetchNote / saveNote      GET|POST /api/coffre/note?y=&m=&d=
├── fetchMeta / saveMeta      GET|POST /api/coffre/meta?y=&m=&d=
└── fetchReactions / saveReactions  GET|POST /api/coffre/reactions?y=&m=&d=
```

### Endpoints backend (chetana.dev)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/coffre/list?prefix=` | ✅ Bearer | Liste GCS avec délimiteur `/` |
| `GET /api/coffre/sign-upload?path=&contentType=` | ✅ Bearer | Signed URL PUT 15 min |
| `GET /api/coffre/sign-download?path=` | ✅ Bearer | Signed URL GET 1h |
| `DELETE /api/coffre/delete?path=` | ✅ Bearer | Supprime un objet GCS |
| `GET /api/coffre/note?y=&m=&d=` | ✅ Bearer | Lit note.txt |
| `POST /api/coffre/note?y=&m=&d=` | ✅ Bearer | Écrit note.txt |
| `GET /api/coffre/meta?y=&m=&d=` | ✅ Bearer | Lit meta.json |
| `POST /api/coffre/meta?y=&m=&d=` | ✅ Bearer | Écrit meta.json |
| `GET /api/coffre/reactions?y=&m=&d=` | ✅ Bearer | Lit reactions.json |
| `POST /api/coffre/reactions?y=&m=&d=` | ✅ Bearer | Écrit reactions.json |
| `GET /api/coffre/preview?y=&m=&d=&f=` | ❌ public | HTML og:image + redirect PWA |
| `GET /api/coffre/og-image?path=[&w=]` | ❌ public | Proxy JPEG via sharp |

---

## GCS — Convention de nommage

```
YYYY/MM/DD/filename.ext     ← photos/vidéos (grille)
YYYY/MM/DD/note.txt         ← note du jour (filtrée hors grille)
YYYY/MM/DD/meta.json        ← {filename: prénomUploader}
YYYY/MM/DD/reactions.json   ← {filename: ["❤️", "😍"]}
```

Drill-down sans DB :
```
listObjects('')           → prefixes = ['2026/']
listObjects('2026/')      → prefixes = ['2026/01/', '2026/02/']
listObjects('2026/02/')   → prefixes = ['2026/02/13/', '2026/02/22/']
listObjects('2026/02/22/')→ items = [{name, size, updated}, ...]
```

---

## Deep links — partage d'une photo

### Format du lien généré

```
https://chetana.fr/api/coffre/preview?y=2026&m=02&d=22&f=photo.jpg
```

→ Les bots WhatsApp/Telegram/Facebook voient le HTML og:image
→ Les vrais utilisateurs sont redirigés vers :

```
https://chetlys.vercel.app/coffre?y=2026&m=02&d=22&f=photo.jpg
```

### Flux côté destinataire (SvelteKit)

```
Ouverture de /coffre?y=2026&m=02&d=22&f=photo.jpg
    │
    +page.ts : load() → { y: '2026', m: '02', d: '22', f: 'photo.jpg' }
    │
    +page.svelte : $effect → year/month/day initialisés depuis data
    │
    DayFiles(year, month, day, initialFile: 'photo.jpg')
    │
    loadAll() → items chargés
    → findIndex(i.name.endsWith(initialFile)) → idx
    → viewerIndex = idx → viewer ouvert sur la bonne photo
```

---

## Compression images (compressor.ts)

```
compressImage(file)
    ├── Blob → ImageBitmap → Canvas
    ├── Redimensionne si > 2048px
    ├── toBlob('image/webp', 0.85) → Chrome/Android
    └── toBlob('image/jpeg', 0.85) → Safari fallback

Gains typiques :
  HEIC 5 MB → JPEG ~700 KB (Safari)     −86%
  JPEG 3 MB → WebP ~300 KB (Chrome)     −90%
  PNG  2 MB → WebP ~150 KB (Chrome)     −93%
```

---

## Thumbnails vidéo (thumbnailer.ts)

```
generateVideoThumbnail(videoUrl)
    ├── HTMLVideoElement (src: url, muted, preload: 'metadata')
    ├── loadedmetadata → video.currentTime = 0.5
    ├── seeked → Canvas.drawImage(video) → toBlob('image/jpeg', 0.8)
    └── timeout 8s → null
```

---

## Proxy og-image — thumbnails grille

Les photos brutes d'appareil (ex. Lumix ~8 MB) ne doivent jamais arriver sur le client pour les thumbnails. Le proxy `/api/coffre/og-image?path=...&w=300` transcode côté serveur :

| Source | Résultat client | Mémoire décodée |
|--------|-----------------|-----------------|
| Original 8 MB | ~15 KB JPEG 300px | ~270 KB |
| Sans proxy | ~8 MB | ~96 MB → crash |

La grille utilise toujours ce proxy. Le viewer utilise la signed URL directe (qualité max).

---

## Semaphore (semaphore.ts)

Limite à 3 les requêtes `signDownload` simultanées pour éviter la saturation réseau mobile sur les jours avec beaucoup de photos. Voir `docs/technical-choices.md` pour le détail.

---

## Flux de données — Horloge

```
Date système (toutes les secondes)
    │
    ├── toZonedTime(now, 'Europe/Paris')    → paris
    └── toZonedTime(now, 'Asia/Phnom_Penh') → pp
          │
          ├── fmtTime()  → HH:mm:ss
          ├── fmtDate()  → "dimanche 22 février" (date-fns/locale fr)
          ├── fmtDateKh()→ "អាទិត្យ 22 កុម្ភៈ"
          ├── getStatus(hour) → {icon, fr, kh}
          └── getDaysTogether(now) → nombre de jours depuis le 13 jan 2026
```

---

## Icône horloge dynamique (layout)

L'emoji horloge dans la barre de navigation change chaque seconde selon l'heure locale :
- Heures pleines : 🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛
- Demi-heures : 🕜🕝🕞🕟🕠🕡🕢🕣🕤🕥🕦🕧

---

## Déploiement

```
git push → Vercel CI → npm run build → deploy
```

Vercel détecte SvelteKit automatiquement via `@sveltejs/adapter-vercel`. Pas besoin de committer le build (contrairement à l'époque Flutter).

---

## PWA — installation iPhone

```
Lys ouvre Safari → https://chetlys.vercel.app
    │
    ├── manifest.json : nom "Chet & Lys", thème #0F0F1A
    └── Partager → "Sur l'écran d'accueil" → mode standalone
```

---

## Architecture de scroll

Chaque vue gère son propre scroll — les conteneurs parents transmettent la hauteur sans scroller.

```
+layout.svelte
└── main { overflow: hidden; display: flex; flex-direction: column }
    │
    coffre/+page.svelte
    └── .content { overflow: hidden; display: flex; flex-direction: column }
        ├── YearList / MonthList / DayList
        │   └── .list-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch }
        └── DayFiles { height: 100%; overflow: hidden }
                └── .grid { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch }

horloge/+page.svelte
└── .page { height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch }
```

---

## Grille photo — tuiles carrées

La grille utilise CSS Grid avec `grid-auto-rows` calculé en JS car CSS ne peut pas diviser par une custom property :

```svelte
<!-- DayFiles.svelte — columns est une valeur réactive (2, 3, ou 4) -->
<div
    class="grid"
    style="--cols: {columns}; --cell-size: calc((100vw - {columns + 1} * var(--space-1)) / {columns})"
>
```

```css
.grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-auto-rows: var(--cell-size);
    gap: var(--space-1);
}
```

Les tuiles (`FileTile`) utilisent `width: 100%; height: 100%` pour remplir exactement leur cellule.

---

---

## Chat (`/chat`)

Chat temps réel entre Chet et Lys — texte, images, messages vocaux.

### Stockage GCS

```
chat/YYYY/MM/DD.json     ← tableau de ChatMessage (messages du jour)
YYYY/MM/DD/filename      ← images envoyées en chat (même format que le coffre)
```

### Interface ChatMessage

```typescript
interface ChatMessage {
  id: string       // `${Date.now()}-${random}`
  author: string   // prénom Google (firstName)
  text: string
  fr: string       // traduction française (Gemini)
  en: string       // traduction anglaise (Gemini)
  kh: string       // traduction khmère (Gemini)
  lang?: string    // langue détectée du message original : 'fr', 'en' ou 'kh'
  ts: string       // ISO timestamp
  image?: string   // chemin GCS optionnel
  source?: 'audio' // message transcrit depuis un vocal
}
```

### Flux données — envoi message texte

```
Utilisateur tape → debounce 1s → POST /api/chat/suggest
    → GeminiSuggestion { corrected, fr, en, kh, lang, question, lesson? }
    → popup confirmation avec mini leçon 📖

Utilisateur valide → POST /api/chat/messages (avec lang issu de la suggestion)
    → message sauvegardé GCS + broadcast prochain poll
```

### Flux données — message vocal (VAD)

```
MicVAD (Silero v5 + ONNX Runtime Web)
    → onSpeechStart : speaking = true
    → onSpeechEnd(Float32Array samples)
        → filtre < 0.8s (bruit court)
        → float32ToWav(samples, 16000) → Blob WAV
        → arrayBufferToBase64 → POST /api/chat/transcribe
        → { text, fr, en, kh } → POST /api/chat/messages (source: 'audio')
```

### Action bar (long-press message)

```
Ligne 1 : [📋 Copier]   [🗑 Supprimer*]   [✗ Fermer]
          (* auteur uniquement)
─────────── border-top ───────────────────────────────
Ligne 2 : [🔊🇫🇷]        [🔊🇬🇧]           [🔊🇰🇭]
```

**TTS** : `SpeechSynthesisUtterance` avec `lang` `fr-FR` / `en-US` / `km-KH` — Web Speech API native, zéro appel réseau.

### Affichage bulle

3 lignes par message (pas 4) :
1. `msg.text` flaggé selon `msg.lang` (🇫🇷/🇬🇧/🇰🇭) — le message original envoyé
2. + l'une des 2 autres traductions (ex: si 🇫🇷, afficher 🇰🇭 kh)
3. + la 3ème (EN conditionnel — affiché seulement si `msg.lang !== 'en'`)

Fallback : anciens messages sans `lang` → heuristique `isChet(msg.author)`.

### Suggestion Gemini

```typescript
interface GeminiSuggestion {
  corrected: string  // texte corrigé dans la langue détectée
  fr: string
  en: string
  kh: string
  lang: string       // langue détectée du message original : 'fr', 'en' ou 'kh'
  question: string   // "Tu voulais dire..." (FR) ou "តើអ្នកចង់និយាយថា..." (KH)
  lesson?: string    // explication — TOUJOURS dans la langue natale de l'auteur
                     // (FR pour Chet, KH pour Lys — quelle que soit la langue écrite)
                     // absent si aucune faute
}
```

### Détection langue UI

```typescript
// NFD normalization obligatoire — "Chétana".normalize('NFD') → détecte correctement
function isChet(name: string): boolean {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return n === 'chet' || n === 'chetana'
}
// Chet → fr, tout autre → kh (robuste si prénom Google varie ou a un accent)
const userLang = $derived<'fr' | 'kh'>(isChet(firstName) ? 'fr' : 'kh')
```

### États

| Variable | Type | Rôle |
|----------|------|------|
| `messages` | `ChatMessage[]` | Messages du jour affiché |
| `viewOffset` | `number` | 0 = aujourd'hui, -1 = hier… |
| `vadLoading` | `boolean` | Init ONNX en cours |
| `recording` | `boolean` | Écoute active |
| `speaking` | `boolean` | Voix détectée |
| `transcribing` | `boolean` | Transcription Gemini en cours |
| `suggestion` | `GeminiSuggestion\|null` | Suggestion en attente |
| `selectedMsg` | `string\|null` | ID message sélectionné (action bar) |

### Endpoints backend

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/chat/messages?y=&m=&d=` | ✅ Bearer | Liste les messages du jour |
| `POST /api/chat/messages?y=&m=&d=` | ✅ Bearer | Envoie un message (traduit par Gemini si traductions vides) |
| `DELETE /api/chat/messages?y=&m=&d=&id=` | ✅ Bearer | Supprime un message (auteur uniquement) |
| `POST /api/chat/transcribe` | ✅ Bearer | Transcrit audio base64 + traduit (Gemini) |
| `POST /api/chat/suggest` | ✅ Bearer | Correction + traductions + leçon (Gemini) |

---

## Limitations connues (SvelteKit)

- **Réactions cross-day viewer** : non implémentées (viewer ne charge que le jour actif)
- **Navigation cross-day viewer** : non implémentée (swipe limité au jour actif)
- **Pull-to-refresh** : non implémenté
- **Pinch-to-zoom grille** : non implémenté
- **Back browser** : ne remonte pas dans le breadcrumb (gère la navigation SPA normalement)
- **Multi-upload iOS Safari** : Apple limite le picker à 1 fichier à la fois
- **Compression vidéo** : pas de compression, upload brut
- **Thumbnail vidéo Android** : fonctionne (même API web que le browser desktop)
