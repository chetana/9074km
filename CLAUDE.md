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
    +layout.svelte        — Bottom nav (Horloge / Coffre)
    horloge/+page.svelte  — Double horloge Paris / Phnom Penh
    coffre/+page.svelte   — Auth gate + navigation hiérarchique
    coffre/components/    — Breadcrumb, YearList, MonthList, DayList,
                            DayNavBar, DaysChipBar, NoteField, FileTile,
                            FabUpload, FileViewer, DayFiles
```

## Conventions

- **Svelte 5 runes** : `$state`, `$derived`, `$effect`, `$props` — pas d'API Options
- **CSS variables** : `--bg`, `--card`, `--accent`, `--text`, `--muted`, `--border`
- **Convention fichiers GCS** : `YYYY/MM/DD/filename`
- **Fichiers méta** : `note.txt`, `meta.json`, `reactions.json` — filtrés de la grille
- **Thème** : dark uniquement, accent rose `#E8A4B8`
- **Bilinguisme** : FR + Khmer partout dans l'UI

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
- **Upload** : FilePicker → compress → signUpload → PUT GCS → saveMeta
- **Deep link** : `/coffre?y=2026&m=02&d=22&f=photo.jpg`
- **Couple ensemble depuis** : 2026-01-13
- **Distance** : 9 074 km, fuseau +6h (Paris → Phnom Penh)

## Archive Flutter

Le code Flutter original est conservé dans `app-flutter/` pour référence.
