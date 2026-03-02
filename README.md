# Chet & Lys — Application de couple

PWA SvelteKit pour **Chet** (Paris 🇫🇷) et **Lys** (Phnom Penh 🇰🇭).

**Live** : [https://chetlys.vercel.app](https://chetlys.vercel.app)

---

## Stack

- **Frontend** : SvelteKit 5 + Svelte 5 runes + TypeScript
- **Déploiement** : Vercel — auto-deploy sur push `master`
- **Backend API** : [chetana.dev](https://chetana.dev) (Nuxt 3 / Nitro)
- **Stockage** : Google Cloud Storage bucket `chet-lys-coffre`
- **Auth** : Google Identity Services (GIS) — JWT Bearer token
- **AI** : Vertex AI Gemini 2.5 Flash (traductions, transcription, suggestions)
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
    chat/+page.svelte     — Chat complet : texte, image, vocal, TTS
```

---

## Conventions

- **Svelte 5 runes** : `$state`, `$derived`, `$effect`, `$props` — pas d'API Options
- **CSS variables** : `--bg`, `--card`, `--accent`, `--text`, `--muted`, `--border`
- **GCS** : `YYYY/MM/DD/filename` pour les fichiers, `chat/YYYY/MM/DD.json` pour les messages
- **Thème** : dark uniquement, accent rose `#E8A4B8`
- **Bilinguisme** : FR + Khmer partout dans l'UI
- **Langue UI** : `firstName === 'chet'` → FR, tout autre → KH par défaut

---

## Dev

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build production (ignore l'erreur EPERM symlink Windows)
npm run preview
```

> L'erreur `EPERM symlink` sur Windows après le build Vite est normale (adapter-vercel).
> Le build Vite lui-même (`✓ built`) est correct. Vercel construit sur Linux sans problème.

---

## Déploiement

Push sur `master` → Vercel auto-déploie → `chetlys.vercel.app`

---

## Documentation

- [Architecture](docs/architecture.md) — Structure, flux de données, composants
- [Choix techniques](docs/technical-choices.md) — Décisions, bugs résolus, patterns

## Archive

Le code Flutter original est conservé dans `app-flutter/` pour référence historique.
