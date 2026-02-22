# Architecture — chet_lys

## Vue d'ensemble

L'application est un **widget Flutter pur** avec deux onglets : une double horloge (sans backend) et un coffre à souvenirs (avec backend GCS via chetana.dev).

---

## Structure du code

```
lib/
├── main.dart
│   ├── main()             # init timezones + runApp
│   ├── ChetLysApp         # MaterialApp — thème sombre #0F0F1A
│   ├── HomeScreen         # StatefulWidget — BottomNavigationBar (2 onglets)
│   ├── ClockScreen        # Stateful — Timer 1s, double fuseau horaire
│   ├── _ClockCard         # Card par personne (heure, date, status bilingue FR+KH)
│   └── _DistanceIndicator # 9 074 km + décalage horaire
│
└── coffre/
    ├── auth_service.dart       # Singleton AuthService — GoogleSignIn web
    ├── coffre_api.dart         # Fonctions REST vers chetana.dev/api/coffre/*
    │                           # + fetchNote() / saveNote() pour note.txt
    ├── coffre_screen.dart      # Auth gate + PopScope + routing state + breadcrumb AppBar
    ├── image_compressor.dart   # Export conditionnel (dart.library.html)
    ├── image_compressor_web.dart   # Canvas WebP→JPEG, max 2048px — web uniquement
    ├── image_compressor_stub.dart  # Pass-through — Android natif
    ├── year_list.dart          # YearListBody — liste des années + compteur mois
    ├── month_list.dart         # MonthListBody — liste des mois (FR+KH) + compteur jours
    ├── day_list.dart           # DayListBody — liste des jours (date + FR+KH)
    └── day_files.dart          # DayFilesScreen — tout l'écran jour (voir détail ci-dessous)
```

---

## Navigation Coffre

La navigation est **state-based** (pas de `Navigator.push`). `CoffreScreen` gère les variables `_year`, `_month`, `_day` et affiche le bon widget body selon l'état.

```
_year == null  → YearListBody
_month == null → MonthListBody(year)
_day == null   → DayListBody(year, month)
else           → DayFilesScreen(year, month, day)
```

L'AppBar affiche en permanence :
- **Breadcrumb cliquable** : `Coffre › 2026 › 02 › 22` — chaque segment remet à null les niveaux inférieurs
- **Icône calendrier** : `showDatePicker` (thème sombre) → met à jour `_year/_month/_day` directement
- **Icône logout** : appelle `AuthService.disconnect()` pour forcer le sélecteur de compte

```
Coffre › 2026 › 02 › 22      [📅]  [logout]
  ↑tap      ↑tap  ↑tap  (courant)
```

### Back Android (PopScope)

`CoffreScreen` est enveloppé dans un `PopScope` :
- `_day != null` → efface `_day` (remonte à la liste des jours)
- `_month != null` → efface `_month` (remonte aux mois)
- `_year != null` → efface `_year` (remonte aux années)
- `_year == null` → `canPop: true` → quitte l'onglet normalement

### Compteurs dans les listes

Après le chargement principal, les listes lancent des requêtes parallèles pour enrichir l'affichage :
- `YearListBody` : pour chaque année, `listObjects('YYYY/')` → compte les mois → affiche "X mois · X ខែ"
- `MonthListBody` : pour chaque mois, `listObjects('YYYY/MM/')` → compte les jours → affiche "X jours · X ថ្ងៃ"
- `DayListBody` : pour chaque jour, `listObjects('YYYY/MM/DD/')` → compte les fichiers (note.txt exclu) → affiche "X fichiers · X ឯកសារ"

---

## DayFilesScreen — widgets internes

```
DayFilesScreen
├── _DayNavBar
│   ├── < prev (onPrevDay callback)
│   ├── Dimanche · អាទិត្យ  Jan 22   (label FR+KH)
│   ├── next > (onNextDay callback)
│   └── [zoom icon] toggle 2/3/4 colonnes (_columns state)
│
├── _DaysChipBar  (StatefulWidget)
│   ├── ScrollController + GlobalKey sur chip active
│   ├── Auto-scroll vers chip active (initState + didUpdateWidget)
│   ├── Compteur par jour : chargé en parallèle dans _loadDays()
│   │   → Map<String, int> _dayCounts via Future.wait(listObjects par jour)
│   └── Chip actif mis en évidence, tap → onDayJump → CoffreScreen._day
│
├── _NoteField  (StatefulWidget)
│   ├── Barre pliable — affiche aperçu du texte ou placeholder
│   ├── TextField multi-lignes, auto-save onTapOutside / onSubmitted
│   └── Stocké en GCS : YYYY/MM/DD/note.txt (filtré hors de la grille)
│
├── GridView (_FileTile)
│   ├── key: ValueKey(name)         # évite réutilisation d'état
│   ├── getUrl: _getCachedUrl       # cache parent Map<String, String?>
│   ├── RefreshIndicator            # pull-to-refresh → _load()
│   ├── SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: _columns)
│   └── onLongPress → _showTileMenu (bottom sheet : Sélectionner / Partager / Supprimer)
│
├── _FabProgress  (upload en 2 phases)
│   ├── Phase compressing : ✨ icône + X/N
│   └── Phase uploading   : ⏳ spinner + X/N
│
└── _FileViewer (Dialog.fullscreen)
    ├── PageView.builder (PageController viewportFraction: 0.92)  ← peek effect
    ├── onPageChanged → _loadAdjacent() si bord atteint (cross-day ±60j)
    ├── _urlCache Map<String, String?> partagé entre toutes les pages
    ├── Share.shareUri(signedUrl)    ← Web Share API iOS + Android
    └── _PageContent (StatefulWidget, une instance par page)
        ├── InteractiveViewer   # pinch-to-zoom images
        └── ChewieController   # lecteur vidéo (autoPlay: false)
```

### Rechargement réactif

`DayFilesScreen` utilise `didUpdateWidget` pour détecter les changements de date :
- `year/month/day` change → `_items = null`, `_urlCache.clear()`, `_noteLoaded = false` + `_load()` + `_loadNote()`
- `year/month` change → `_days = null`, `_dayCounts = {}` + `_loadDays()`

---

## Compression images

```
compressImage(bytes, filename, contentType)   [image_compressor.dart]
        │
        │  dart.library.html → web
        ▼
image_compressor_web.dart
        │
        ├── Blob(bytes) → ImageElement → load
        ├── Redimensionne si > 2048px (préserve ratio)
        ├── CanvasElement.drawImageScaled()
        │
        ├── canvas.toDataUrl('image/webp', 0.85)
        │       └── Chrome/Android : WebP → si résultat < original → ✓
        │       └── Safari          : retourne PNG (non webp) → skipped
        │
        └── canvas.toDataUrl('image/jpeg', 0.85)
                └── Universel (Safari inclus) → si résultat < original → ✓
                └── Sinon : retourne l'original intact (fallback)

Gains typiques :
  HEIC 5 MB → JPEG ~700 KB (Safari)   −86%
  JPEG 3 MB → WebP ~300 KB (Chrome)   −90%
  PNG  2 MB → WebP ~150 KB (Chrome)   −93%
```

Pour Android natif (`image_compressor_stub.dart`) : pass-through, bytes renvoyés tels quels.

---

## Flux de données — Coffre

```
AuthService.signIn()
    └── GoogleSignIn.signIn()         # popup compte Google
            └── idToken()             # JWT signé par Google (~1h)

coffre_api.dart  (toutes les fonctions ajoutent le Bearer token)
    │
    ├── listObjects(prefix)
    │       └── GET chetana.dev/api/coffre/list?prefix=YYYY/MM/DD/
    │               └── GCS list avec delimiter "/" → prefixes + items
    │
    ├── signUpload(path, contentType)
    │       └── POST chetana.dev/api/coffre/sign-upload
    │               └── Signed URL PUT v4 (15 min) → Node.js crypto
    │
    ├── uploadFile(signedUrl, bytes, contentType)
    │       └── PUT <signed_url> (direct vers GCS, pas via Nitro)
    │
    ├── signDownload(path)
    │       └── GET chetana.dev/api/coffre/sign-download?path=
    │               └── Signed URL GET v4 (1h)
    │
    ├── deleteObject(path)
    │       └── DELETE chetana.dev/api/coffre/delete?path=
    │               └── GCS file.delete()
    │
    ├── fetchNote(year, month, day)
    │       └── signDownload('YYYY/MM/DD/note.txt')
    │               └── GET <signed_url> → utf8.decode(body)
    │
    └── saveNote(year, month, day, text)
            └── signUpload('YYYY/MM/DD/note.txt', 'text/plain')
                    └── PUT <signed_url> avec utf8.encode(text)
```

---

## GCS — Convention de nommage

```
YYYY/MM/DD/filename.ext    ← photos et vidéos (affichées dans la grille)
YYYY/MM/DD/note.txt        ← note du jour (filtrée hors grille, chargée séparément)

Le prefix seul suffit pour drill-down sans DB :
  listObjects('')           → prefixes = ['2026/']
  listObjects('2026/')      → prefixes = ['2026/02/']
  listObjects('2026/02/')   → prefixes = ['2026/02/22/']
  listObjects('2026/02/22/') → items = [{name, contentType, size}, ...]
                               + items filtrés : note.txt exclu de la grille
```

---

## Signed URLs v4 (Node.js natif)

Le SDK `@google-cloud/storage` est bundlé par Nitro/Rollup, ce qui casse les prototypes de classes (méthodes de signing inaccessibles). La solution : implémentation v4 avec le module crypto natif de Node.js dans `server/utils/gcs.ts`.

```
Canonical request :
  METHOD\n
  /bucket/path\n
  queryString\n
  canonicalHeaders\n
  signedHeaders\n
  UNSIGNED-PAYLOAD

→ SHA-256 → stringToSign
→ RSA-SHA256 sign avec private_key du service account
→ URL : https://storage.googleapis.com/bucket/path?...&X-Goog-Signature=<hex>
```

---

## CORS

Deux niveaux de CORS nécessaires :

1. **Nuxt middleware** (`server/middleware/cors.ts`) : permet à `chetlys.vercel.app` d'appeler `chetana.dev/api/coffre/*`
2. **GCS bucket CORS** (`cors.json`) : permet à `chetlys.vercel.app` de faire des PUT directs vers GCS

---

## Flux de données — Horloge

```
Système (horloge OS / navigateur)
        │
        │ DateTime.now().toUtc()   [chaque seconde]
        ▼
  ClockScreen._now  (UTC)
        │
        ├──▶ tz.TZDateTime.now('Europe/Paris')     → paris
        └──▶ tz.TZDateTime.now('Asia/Phnom_Penh')  → phnomPenh
                  │
                  ├──▶ _ClockCard (Chet)  → heure / date / status FR+KH
                  ├──▶ _ClockCard (Lys)   → heure / date / status FR+KH
                  └──▶ _DistanceIndicator → "+6h"
```

---

## Déploiement

```
Code Dart (lib/)
        │
        ▼ flutter build web --release
build/web/  (HTML + JS + WASM)
        │
        ▼ npx vercel --prod
Vercel CDN  →  https://chetlys.vercel.app  (projet: chet_lys)
```

> Le build est commité dans le repo car Vercel ne peut pas installer Flutter.

---

## PWA — installation sur iPhone

```
Lys ouvre Safari → https://chetlys.vercel.app
        │
Safari charge index.html
    ├── manifest.json  → nom "Chet & Lys", thème #0F0F1A
    ├── flutter.js     → bootstrap Flutter engine
    └── main.dart.js   → code applicatif transpilé
        │
Lys : Partager → "Sur l'écran d'accueil"
        ▼
Icône "Chet & Lys" → mode standalone (sans barre Safari)
```

---

## Notes de limitations connues

- **Multi-upload iOS (Safari)** : Apple limite `UIImagePickerController` à 1 fichier à la fois, même avec `allowMultiple: true`. Pas de workaround côté code.
- **Compression vidéo web** : pas de solution propre sans FFmpeg.wasm (~30 MB). Les vidéos sont uploadées telles quelles.
- **Compression Android natif** : `image_compressor_stub.dart` est un pass-through. Pour activer la compression sur Android natif, utiliser `flutter_image_compress`.
- **Signed URLs 1h** : si l'app reste ouverte > 1h, les URLs en cache deviennent invalides. Un refresh manuel (pull-to-refresh) recharge les URLs.
