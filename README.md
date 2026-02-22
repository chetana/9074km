# 9074km — Chet & Lys

Application couple cross-plateforme — double horloge, coffre à souvenirs privé, déployée en PWA web.

🌐 **Web (PWA)** : [chetlys.vercel.app](https://chetlys.vercel.app)
📱 **Android** : build local via `flutter run`

---

## Features

### Horloge · នាឡិកា
- **Double horloge** — heure en temps réel à Paris 🇫🇷 et Phnom Penh 🇰🇭, date en français
- **Status bilingue** — FR + Khmer : 🌙 dort · គេង / 🌅 se réveille · ភ្ញាក់ / ☀️ matinée · ព្រឹក / 🍽️ déjeuner · អាហារថ្ងៃ / ☀️ après-midi · រសៀល / 🌆 soirée · ល្ងាច / 🌙 bientôt au lit · ចូលគេង
- **Décalage horaire dynamique** — calculé depuis les offsets de timezone réels
- **Distance** — 9 074 km affichés entre les deux cards
- **💍 Compteur jours ensemble** — "Jour X ensemble · ថ្ងៃទី X" depuis le 13 janvier 2026 (date de la bague)
- **PWA installable** — Lys peut l'ajouter à son écran d'accueil iPhone depuis Safari

### Coffre · ប្រអប់

#### Navigation
- **Auth Google** — connexion avec compte Google, `disconnect()` à la déconnexion → sélecteur de compte complet garanti
- **Breadcrumb cliquable** — `Coffre › 2026 › 02 › 22`, chaque niveau est tappable pour remonter
- **Back Android** — bouton retour remonte dans le breadcrumb (PopScope)
- **Icône calendrier** — dans l'AppBar, ouvre un date picker pour sauter directement à n'importe quelle date (utile pour uploader dans une date passée)
- **Bouton "Aujourd'hui · ថ្ងៃនេះ"** — accès direct au jour courant depuis la liste des années
- **Compteurs bilingues dans les listes** — `X mois · X ខែ` / `X jours · X ថ្ងៃ` / `X fichiers · X ឯកសារ` à chaque niveau
- **Mémorisation scroll** — position de scroll restaurée automatiquement au retour dans chaque liste (PageStorageKey)

#### Vue jour
- **Flèches `< >`** — navigation jour par jour
- **Zoom grille** — icône à droite des flèches, cycle 2 → 3 → 4 colonnes
- **Pinch-to-zoom grille** — écarter les doigts → moins de colonnes, pincer → plus de colonnes
- **Chips des jours** — bandeau horizontal scrollable, uniquement les jours avec contenu, avec compteur `22 (3)` — **auto-scroll** vers le jour actif
- **Chip "aujourd'hui" mis en évidence** — point rose + bordure rose translucide sur le chip du jour courant
- **Note du jour** — champ texte pliable sous les chips, sauvegardé automatiquement en `note.txt` dans GCS
- **Pull-to-refresh** — swipe bas pour recharger la grille

#### Upload
- **Compression avant upload** — canvas WebP (Chrome/Android) ou JPEG (Safari/iPhone) à 85% qualité, max 2048px — gains typiques −85 à −95%
- **Progression en 2 phases** — FAB affiche ✨ compression `X/N` puis ⏳ upload `X/N`
- **Multi-sélection** — `allowMultiple: true`, upload séquentiel
- **Fallback automatique** — si la compression échoue ou si le résultat est plus grand, l'original est envoyé intact
- **Badge uploader** — nom de l'uploader sauvegardé dans `meta.json`, affiché en badge bas-gauche sur chaque photo

#### Médias
- **Cache images sur disque** — `cached_network_image` avec `cacheKey: item.name` (stable, pas l'URL signée qui change chaque heure)
- **Miniature vidéo réelle** — frame extraite à 0,5s via HTML VideoElement + CanvasElement (web uniquement), bouton play centré
- **Viewer plein écran** — `Dialog.fullscreen` + `PageView` (swipe entre toutes les photos du jour)
- **Animation d'ouverture** — ScaleTransition (0.88 → 1.0) + FadeTransition en 280ms à l'ouverture du viewer
- **Mode immersif** — tap sur le viewer → barre UI disparaît/réapparaît (AnimatedOpacity 200ms)
- **Peek effect** — `viewportFraction: 0.92` → aperçu de la photo suivante/précédente sur les bords
- **Navigation cross-day** — au bord du PageView, charge automatiquement le jour adjacent avec du contenu (jusqu'à ±60 jours)
- **Réactions emoji** — ❤️ 😍 😂 🥹 🔥 👏 — barre en bas du viewer, toggle par tap, stocké dans `reactions.json`, badge visible sur les tuiles
- **Partage** — icône share dans le viewer → Web Share API (iOS Share Sheet, Android)
- **Pinch-to-zoom** — images avec InteractiveViewer
- **Lecteur vidéo** — Chewie (play/pause, seek bar, plein écran)

#### Gestion
- **Menu long-press** — bottom sheet contextuel : Sélectionner / Partager / Supprimer
- **Mode sélection** — long press → checkboxes → suppression groupée (barre en bas)
- **Labels bilingues** — mois : `01 — Janvier · មករា` / jours : `2026/02/22 — Dimanche · អាទិត្យ`
- **Seuls les dates avec contenu** sont affichées dans les listes et les chips (issues de GCS, pas de DB)

---

## Architecture

```
lib/
├── main.dart                  # ChetLysApp + HomeScreen (BottomNav) + _DaysTogetherBadge
│
├── coffre/
│   ├── auth_service.dart      # GoogleSignIn singleton — signIn / disconnect / idToken / currentUser
│   ├── coffre_api.dart        # Appels REST chetana.dev/api/coffre/* + fetchNote/saveNote
│   │                          # + fetchMeta/saveMeta + fetchReactions/saveReactions
│   ├── coffre_screen.dart     # Auth gate + PopScope + état navigation + breadcrumb
│   ├── image_compressor.dart  # Export conditionnel web/stub
│   ├── image_compressor_web.dart   # Canvas WebP→JPEG, max 2048px (web uniquement)
│   ├── image_compressor_stub.dart  # Pass-through pour Android natif
│   ├── video_thumbnailer.dart      # Export conditionnel web/stub
│   ├── video_thumbnailer_web.dart  # HTMLVideoElement → Canvas frame à 0.5s (web uniquement)
│   ├── video_thumbnailer_stub.dart # Retourne null sur Android natif
│   ├── year_list.dart         # YearListBody — liste des années + compteur mois
│   ├── month_list.dart        # MonthListBody — liste des mois (FR+KH) + compteur jours
│   ├── day_list.dart          # DayListBody — liste des jours (date + FR+KH)
│   └── day_files.dart         # DayFilesScreen — tout le reste (voir ci-dessous)
│
└── [ClockScreen + _DaysTogetherBadge dans main.dart]
```

```
DayFilesScreen (day_files.dart) :
├── _DayNavBar         # < prev · Dimanche · អាទិត្យ · Jan 22 · next > · [zoom]
├── _DaysChipBar       # Chips jours avec compteur, auto-scroll, highlight aujourd'hui
├── _NoteField         # Note pliable du jour, auto-save onTapOutside
├── GestureDetector (pinch-to-zoom colonnes)
│   └── RefreshIndicator
│       └── GridView (_FileTile)
│           ├── key: ValueKey(name)    # évite réutilisation d'état
│           ├── getUrl: _getCachedUrl  # cache signé dans le parent (évite N requêtes)
│           ├── uploaderName           # depuis _meta[filename] → badge bas-gauche
│           └── reactions              # depuis _reactions[filename] → badge bas-droit
├── _FabProgress       # ✨ compressing X/N · ⏳ uploading X/N
└── _FileViewer (Dialog.fullscreen + showGeneralDialog + ScaleTransition/FadeTransition)
    ├── GestureDetector(onTap: toggle UI)
    ├── PageView.builder (viewportFraction: 0.92)  # peek effect
    ├── _PageContent (StatefulWidget par page)
    │   ├── CachedNetworkImage  # cache disque, cacheKey: item.name
    │   ├── InteractiveViewer   # pinch-to-zoom images
    │   └── Chewie              # lecteur vidéo
    ├── Positioned top → AnimatedOpacity → barre titre + close + share
    └── Positioned bottom → AnimatedOpacity → barre réactions (❤️ 😍 😂 🥹 🔥 👏)
```

```
Navigation Coffre (state-based, pas de Navigator.push) :

CoffreScreen
├── _year == null      → YearListBody
├── _month == null     → MonthListBody(year)
├── _day == null       → DayListBody(year, month)
└── else               → DayFilesScreen(year, month, day)

AppBar (persistant) :
  [breadcrumb cliquable]  Coffre › 2026 › 02 › 22  [📅 date picker] [logout]

Back Android (PopScope) :
  _day != null   → _day = null
  _month != null → _month = null
  _year != null  → _year = null
  _year == null  → pop (quitte)
```

```
Upload flow :

FAB "+" → FilePicker.pickFiles(allowMultiple: true)
       → [phase compressing] compressImage() → canvas WebP ou JPEG, max 2048px
       → [phase uploading]   POST /api/coffre/sign-upload { path, contentType }
       → PUT <signed_url> avec bytes compressés (http.put direct vers GCS)
       → saveMeta() → PUT meta.json avec {filename: prénom uploader}
       → listObjects() refresh
```

```
Réactions emoji flow :

_FileViewerState._toggleReaction(emoji)
       → setState(_reactions)
       → widget.onReactionsChanged(updated)  ← notifie _DayFilesScreenState
       → saveReactions(year, month, day, updated)
             → PUT reactions.json dans GCS

Au chargement du jour :
       → fetchReactions() → Map<filename, [emoji, ...]>
       → passé aux _FileTile (badge bas-droit)
       → passé au _FileViewer (barre emoji bas)
```

---

## Backend (chetana.dev)

Les appels API coffre vont vers `https://chetana.dev/api/coffre/` :

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/coffre/list?prefix=` | GET | Liste les objets GCS avec délimiteur `/` |
| `/api/coffre/sign-upload` | POST | Génère un signed URL PUT (15 min) |
| `/api/coffre/sign-download?path=` | GET | Génère un signed URL GET (1h) |
| `/api/coffre/delete?path=` | DELETE | Supprime un objet GCS |

Tous les endpoints requièrent `Authorization: Bearer <google_id_token>`.

---

## GCS — Convention de nommage

```
YYYY/MM/DD/filename.ext    ← photos et vidéos (affichées dans la grille)
YYYY/MM/DD/note.txt        ← note du jour (filtrée hors grille, chargée séparément)
YYYY/MM/DD/meta.json       ← {filename: prénomUploader} (filtré hors grille)
YYYY/MM/DD/reactions.json  ← {filename: ["❤️", "😍", ...]} (filtré hors grille)
```

`note.txt`, `meta.json` et `reactions.json` sont exclus de l'affichage dans la grille mais chargés séparément.

---

## Tech Stack

| Layer | Technologie |
|-------|------------|
| Langage | Dart |
| Framework | Flutter 3 (stable) |
| Auth | google_sign_in ^6.2.2 (web clientId) |
| Upload | file_picker ^8.1.4 + http ^1.2.2 |
| Compression images | canvas API (dart:html) — WebP/JPEG |
| Thumbnails vidéo | HTMLVideoElement + CanvasElement (dart:html) |
| Cache images | cached_network_image ^3.4.1 (cache disque) |
| Timezones | `timezone: ^0.10.0` |
| Vidéo | video_player ^2.9.2 + chewie ^1.8.5 |
| Partage | share_plus ^10.1.4 |
| Stockage | Google Cloud Storage (bucket `chet-lys-coffre`) |
| Cible Web | PWA — Chrome, Safari, Firefox |
| Hébergement web | Vercel (static, outputDirectory: build/web) |
| Gestionnaire Flutter | [Puro](https://puro.dev) |

---

## Build & Run

### Web (dev)

```bash
flutter run -d chrome
```

### Web (production → Vercel)

```bash
flutter build web --release
npx vercel --prod
```

> **Note** : `build/web` est commité dans le repo (le seul sous-dossier de `build/` non ignoré) car Vercel ne peut pas installer Flutter pour compiler côté serveur. Lors de chaque mise à jour, rebuilder puis `npx vercel --prod`.

### Android

```bash
# Connecter le téléphone (filaire ou sans fil)
adb pair <ip>:<pair-port>   # entrer le code à 6 chiffres
adb connect <ip>:<port>     # port affiché sur l'écran principal

# Lancer en mode debug
flutter run -d <device-id>
```

---

## Variables d'environnement (backend chetana.dev)

| Variable | Description |
|---|---|
| `GCS_BUCKET_NAME` | Nom du bucket GCS (`chet-lys-coffre`) |
| `GCS_SERVICE_ACCOUNT_JSON` | JSON du service account (Storage Object Admin) stringifié |

---

## Documentation

- [Architecture](docs/architecture.md) — Structure du code et flux de données
- [Choix techniques](docs/technical-choices.md) — Pourquoi Flutter, pourquoi Vercel

---

## License

Projet privé — Chet & Lys.
