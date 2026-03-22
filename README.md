# Chet & Lys — Application de couple

PWA SvelteKit pour **Chet** (Paris 🇫🇷) et **Lys** (Phnom Penh 🇰🇭).

**Live** : [https://lys.chetana.dev](https://lys.chetana.dev)

---

## Stack

- **Frontend** : SvelteKit 5 + Svelte 5 runes + TypeScript
- **Déploiement** : Cloud Run (`lys`, europe-west1) — `gcloud run deploy lys --source . --env-vars-file envvars.yaml`
- **Backend intégré** : `src/routes/api/` (chat, coffre, og-image — plus de dépendance externe)
- **Stockage** : Google Cloud Storage bucket `chet-lys-coffre`
- **Auth** : Google Identity Services (GIS) — JWT Bearer token
- **AI** : Vertex AI Gemini (`gemini-3-flash-preview` → fallback `gemini-2.5-flash`)
- **VAD** : Silero v5 via `@ricky0123/vad-web` + ONNX Runtime Web

---

## Fonctionnalités

### 🕐 Horloge double fuseau
- Heures en temps réel Paris (Europe/Paris) et Phnom Penh (Asia/Phnom_Penh)
- Statut contextuel selon l'heure (sommeil, travail, repas…) en FR + KH
- Compteur de jours depuis le début de la relation (13 janvier 2026)
- Icône horloge animée dans la nav (24 états, mise à jour chaque seconde)

### 📦 Coffre à souvenirs
- Navigation hiérarchique Année → Mois → Jour sans base de données (GCS `YYYY/MM/DD/`)
- Upload photos/vidéos avec compression Canvas (WebP/JPEG, max 2048px, −86 à −93%)
- Viewer plein écran avec swipe entre photos, réactions emoji, partage
- Note du jour auto-sauvegardée, métadonnées d'upload (qui a uploadé quoi)
- Deep links partageables avec preview og:image pour WhatsApp/Telegram

### 💬 Chat temps réel
- Messages texte, images 📷, vocaux 🎤 — stockés dans GCS `chat/YYYY/MM/DD.json`
- Traduction automatique Gemini : chaque message a `fr`, `en`, `kh`
- Navigation historique (← →) pour consulter les jours passés
- Polling toutes les 8s (uniquement pour aujourd'hui)
- Heure affichée sous chaque bulle : 🇫🇷 Paris · 🇰🇭 Phnom Penh
- Badge 🎤 sur les messages vocaux

#### Suggestion / correction Gemini
- Debounce 1s pendant la frappe → suggestion de correction + 3 traductions
- Question de confirmation dans la langue native (FR pour Chet, KH pour Lys)
- Mini leçon 📖 expliquant la règle grammaticale corrigée (FR/KH selon auteur)

#### Action bar (long-press message)
| Ligne 1 | Ligne 2 |
|---------|---------|
| 📋 Copier (text + 3 traductions) | 🔊🇫🇷 Écouter en français |
| 🗑 Supprimer (auteur uniquement) | 🔊🇬🇧 Listen in English |
| ✗ Fermer | 🔊🇰🇭 ស្ដាប់ជាខ្មែរ |

- TTS via Web Speech API (`SpeechSynthesisUtterance`) — zéro appel réseau
- Labels bilingues FR/KH selon l'utilisateur connecté

#### VAD (Voice Activity Detection)
- Détection automatique de la voix avec Silero v5 + ONNX Runtime Web
- Filtre segments < 0.8s (évite les bruits parasites)
- WAV 16kHz → base64 → POST `/api/chat/transcribe` → Gemini → texte + 3 traductions

---

## Structure

```
src/
  lib/
    auth.ts        — Google GIS auth, userStore/tokenStore
    api.ts         — Client REST vers chetana.dev
    compressor.ts  — Compression image Canvas (WebP/JPEG, max 2048px)
    thumbnailer.ts — Thumbnail vidéo via HTMLVideoElement
    semaphore.ts   — Queue async (max 3 signDownload simultanés)
    i18n.ts        — Labels FR + Khmer, COUPLE_START, STATUS, REACTIONS
  routes/
    +layout.svelte        — Bottom nav (Horloge / Coffre / Chat)
    horloge/+page.svelte  — Double horloge Paris / Phnom Penh
    coffre/+page.svelte   — Auth gate + navigation state-based
    coffre/components/    — Breadcrumb, YearList, MonthList, DayList,
                            DayNavBar, DaysChipBar, NoteField, FileTile,
                            FabUpload, FileViewer, DayFiles
    chat/+page.svelte     — Chat complet : texte, image, vocal, TTS, emojis
    api/
      chat/             — messages, suggest, transcribe, lessons
      coffre/           — list, sign-upload, sign-download, delete,
                          preview, og-image, note, meta, reactions
```

---

## Conventions

- **Svelte 5 runes** : `$state`, `$derived`, `$effect`, `$props` — pas d'API Options
- **CSS variables** : `--bg`, `--card`, `--accent`, `--accent-warm`, `--text`, `--muted`, `--border`
- **GCS** : `YYYY/MM/DD/filename` pour les fichiers, `chat/YYYY/MM/DD.json` pour les messages
- **Thème** : dark/light, sakura rose → eau teal (Nouvel An Khmer 1–20 avril)
- **Polices** : Inter (latin) + Noto Sans Khmer — Google Fonts variable
- **Navigation** : Floating dock 3D — Horloge | Chat | Coffre (Chat centré)
- **Bilinguisme** : FR + Khmer partout dans l'UI

---

## Dev

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build production
npm run preview
```

---

## Déploiement

```bash
node gen-envvars.cjs        # génère envvars.yaml depuis .env
gcloud run deploy lys \
  --source . \
  --env-vars-file envvars.yaml \
  --region europe-west1 \
  --project cykt-399216 \
  --allow-unauthenticated
```

**Ne jamais committer** `.env` ni `envvars.yaml`.

---

## Archive

Le code Flutter original est conservé localement dans `app-flutter/` (non versionné, 120 MB).
