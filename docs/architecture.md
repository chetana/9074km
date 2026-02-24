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
│   ├── api.ts                 # Appels REST vers chetana.dev/api/coffre/*
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
    └── coffre/
        ├── +page.ts           # load() : lit les query params deep link (y, m, d, f)
        ├── +page.svelte       # Auth gate + navigation state-based
        └── components/
            ├── Breadcrumb.svelte    # Coffre › 2026 › 02 › 22
            ├── YearList.svelte      # Liste des années + compteur mois
            ├── MonthList.svelte     # Liste des mois FR+KH + compteur jours
            ├── DayList.svelte       # Liste des jours + compteur fichiers
            ├── DayFiles.svelte      # Vue jour : grille + viewer + upload
            ├── DayNavBar.svelte     # ‹ label › [zoom]
            ├── DaysChipBar.svelte   # Chips jours avec compteur, auto-scroll
            ├── NoteField.svelte     # Note pliable du jour, auto-save
            ├── FileTile.svelte      # Tuile grille (image/vidéo + badges)
            ├── FabUpload.svelte     # Bouton upload + progression 2 phases
            └── FileViewer.svelte    # Viewer plein écran (swipe + réactions)
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
https://chetana.dev/api/coffre/preview?y=2026&m=02&d=22&f=photo.jpg
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

## Limitations connues (SvelteKit)

- **Réactions cross-day viewer** : non implémentées (viewer ne charge que le jour actif)
- **Navigation cross-day viewer** : non implémentée (swipe limité au jour actif)
- **Pull-to-refresh** : non implémenté
- **Pinch-to-zoom grille** : non implémenté
- **Back browser** : ne remonte pas dans le breadcrumb (gère la navigation SPA normalement)
- **Multi-upload iOS Safari** : Apple limite le picker à 1 fichier à la fois
- **Compression vidéo** : pas de compression, upload brut
- **Thumbnail vidéo Android** : fonctionne (même API web que le browser desktop)
