# Architecture — chet_lys

## Vue d'ensemble

L'application est un **widget Flutter pur** avec deux onglets : une double horloge (sans backend) et un coffre à souvenirs (avec backend GCS via chetana.dev).

---

## Structure du code

```
lib/
├── main.dart
│   ├── main()                # init timezones + runApp
│   ├── ChetLysApp            # MaterialApp — thème sombre #0F0F1A
│   ├── HomeScreen            # StatefulWidget — BottomNavigationBar (2 onglets)
│   │                         # initState() parse Uri.base.queryParameters (deep link)
│   ├── ClockScreen           # Stateful — Timer 1s, double fuseau horaire
│   ├── _ClockCard            # Card par personne (heure, date, status bilingue FR+KH)
│   ├── _DaysTogetherBadge    # "💍 Jour X ensemble" depuis _coupleStartDate (13 jan 2026)
│   └── _DistanceIndicator    # 9 074 km + décalage horaire
│
└── coffre/
    ├── auth_service.dart          # Singleton AuthService — GoogleSignIn web
    │                              # signIn() / disconnect() / idToken() / currentUser
    ├── coffre_api.dart            # Fonctions REST vers chetana.dev/api/coffre/*
    │                              # listObjects / signUpload / signDownload / deleteObject
    │                              # fetchNote / saveNote
    │                              # fetchMeta / saveMeta        (meta.json)
    │                              # fetchReactions / saveReactions (reactions.json)
    ├── coffre_screen.dart         # Auth gate + PopScope + routing state + breadcrumb AppBar
    │                              # initialYear/Month/Day/File → navigation directe (deep link)
    ├── image_compressor.dart      # Export conditionnel (dart.library.html)
    ├── image_compressor_web.dart  # Canvas WebP→JPEG, max 2048px — web uniquement
    ├── image_compressor_stub.dart # Pass-through — Android natif
    ├── video_thumbnailer.dart     # Export conditionnel (dart.library.html)
    ├── video_thumbnailer_web.dart # HTMLVideoElement + CanvasElement, frame à 0.5s — web
    ├── video_thumbnailer_stub.dart# Retourne null — Android natif
    ├── year_list.dart             # YearListBody — liste des années + compteur mois
    ├── month_list.dart            # MonthListBody — liste des mois (FR+KH) + compteur jours
    ├── day_list.dart              # DayListBody — liste des jours (date + FR+KH)
    └── day_files.dart             # DayFilesScreen — tout l'écran jour (voir détail ci-dessous)
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

### Mémorisation scroll (PageStorageKey)

Chaque `ListView.builder` dans les listes porte une `PageStorageKey` unique :
- `YearListBody` : `PageStorageKey('year-list')`
- `MonthListBody` : `PageStorageKey('month-list-$year')`
- `DayListBody` : `PageStorageKey('day-list-$year-$month')`

Flutter restaure automatiquement la position de scroll au retour dans la liste.

### Compteurs dans les listes

Après le chargement principal, les listes lancent des requêtes parallèles pour enrichir l'affichage :
- `YearListBody` : pour chaque année, `listObjects('YYYY/')` → compte les mois → affiche "X mois · X ខែ"
- `MonthListBody` : pour chaque mois, `listObjects('YYYY/MM/')` → compte les jours → affiche "X jours · X ថ្ងៃ"
- `DayListBody` : pour chaque jour, `listObjects('YYYY/MM/DD/')` → compte les fichiers (note.txt, meta.json, reactions.json exclus) → affiche "X fichiers · X ឯកសារ"

---

## DayFilesScreen — widgets internes

```
DayFilesScreen
│
├── État principal (_DayFilesScreenState)
│   ├── _items            : List<CoffreItem>?       (fichiers du jour, hors note/meta/reactions)
│   ├── _days             : List<String>?            (jours du mois avec contenu)
│   ├── _dayCounts        : Map<String, int>         (fichiers par jour)
│   ├── _urlCache         : Map<String, String?>     (signed URLs en mémoire 1h)
│   ├── _note             : String                   (texte note du jour)
│   ├── _meta             : Map<String, String>      (filename → prénomUploader)
│   ├── _reactions        : Map<String, List<String>>(filename → [emoji, ...])
│   ├── _columns          : int (2/3/4)              (colonnes grille)
│   ├── _deepLinkHandled  : bool                     (évite double-open au rebuild)
│   └── _phase            : idle / compressing / uploading
│
├── _DayNavBar
│   ├── < prev (onPrevDay callback)
│   ├── Dimanche · អាទិត្យ  Jan 22   (label FR+KH)
│   ├── next > (onNextDay callback)
│   └── [zoom icon] toggle 2/3/4 colonnes (_columns state)
│
├── _DaysChipBar  (StatefulWidget)
│   ├── ScrollController + GlobalKey sur chip active
│   ├── Auto-scroll vers chip active (initState + didUpdateWidget)
│   ├── Highlight "aujourd'hui" : bordure rose + point rose sous le label
│   ├── Compteur par jour : chargé en parallèle dans _loadDays()
│   │   → Map<String, int> _dayCounts via Future.wait(listObjects par jour)
│   └── Chip actif mis en évidence, tap → onDayJump → CoffreScreen._day
│
├── _NoteField  (StatefulWidget)
│   ├── Barre pliable — affiche aperçu du texte ou placeholder
│   ├── TextField multi-lignes, auto-save onTapOutside / onSubmitted
│   └── Stocké en GCS : YYYY/MM/DD/note.txt (filtré hors de la grille)
│
├── GestureDetector (pinch-to-zoom colonnes)
│   ├── onScaleStart : mémorise l'état initial
│   ├── scale > 1.2 → _columns-- (min 2)   ← écartement des doigts
│   └── scale < 0.8 → _columns++ (max 4)   ← resserrement des doigts
│
├── RefreshIndicator → pull-to-refresh → _load()
│
└── GridView (_FileTile)
    ├── key: ValueKey(name)         # évite réutilisation d'état
    ├── getUrl: _getCachedUrl       # cache parent Map<String, String?>
    ├── uploaderName                # depuis _meta[filename]
    ├── reactions                   # depuis _reactions[filename]
    ├── onLongPress → _showTileMenu (bottom sheet : Sélectionner / Partager / Supprimer)
    └── _FileTile (StatefulWidget)
        ├── Image : CachedNetworkImage (cacheKey: item.name, cache disque)
        ├── Vidéo : _videoThumbnail() → generateVideoThumbnail() → frame 0.5s
        ├── Badge bas-gauche : prénomUploader (depuis _meta) — fond noir semi-transparent
        └── Badge bas-droit  : emojis réactions (depuis _reactions) — jusqu'à 3 emojis
```

---

## _FabProgress (upload en 2 phases)

```
Phase compressing : ✨ icône + X/N
Phase uploading   : ⏳ spinner + X/N
```

---

## _FileViewer — Dialog plein écran

```
showGeneralDialog + ScaleTransition(0.88→1.0) + FadeTransition (280ms, easeOutCubic)
        │
        └── Dialog.fullscreen (backgroundColor: black)
            └── GestureDetector(onTap: toggle _showUi)
                ├── PageView.builder (PageController viewportFraction: 0.92)  ← peek effect
                │   ├── onPageChanged → _loadAdjacent() si bord atteint (cross-day ±60j)
                │   └── _PageContent (StatefulWidget, une instance par page)
                │       ├── CachedNetworkImage (cacheKey: item.name)
                │       ├── InteractiveViewer   # pinch-to-zoom images
                │       └── ChewieController   # lecteur vidéo (autoPlay: false)
                │
                ├── Positioned(top) → AnimatedOpacity(_showUi, 200ms) ← barre supérieure
                │   └── IgnorePointer(!_showUi)
                │       ├── [close] [filename] [🔗 link] [share]
                │       │           ↑ _copyLink() → Clipboard + _showCopiedToast
                │       └── fond dégradé noir→transparent
                │
                ├── Positioned(bottom) → AnimatedOpacity(_showUi, 200ms) ← barre réactions
                │   └── IgnorePointer(!_showUi)
                │       ├── [❤️] [😍] [😂] [🥹] [🔥] [👏]  ← toggle par tap
                │       └── fond dégradé noir→transparent (bas→haut)
                │
                └── Positioned(center-bottom) → AnimatedOpacity(_showCopiedToast, 250ms)
                    └── IgnorePointer
                        └── Container blanc arrondi → Text("Copié · ចម្លង")
```

### État du viewer (_FileViewerState)

```dart
_showUi          : bool   // toggle barre top + barre réactions
_showCopiedToast : bool   // toast "Copié · ចម្លង" (2s)
_reactions       : Map<String, List<String>>  // initialisé depuis widget.reactions
```

### Rechargement réactif

`DayFilesScreen` utilise `didUpdateWidget` pour détecter les changements de date :
- `year/month/day` change → `_items = null`, `_urlCache.clear()`, `_noteLoaded = false`, `_meta = {}`, `_reactions = {}` + `_load()` + `_loadNote()` + `_loadMeta()` + `_loadReactions()`
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

## Thumbnails vidéo

```
generateVideoThumbnail(videoUrl)   [video_thumbnailer.dart]
        │
        │  dart.library.html → web
        ▼
video_thumbnailer_web.dart
        │
        ├── HTMLVideoElement(src: url, muted: true, preload: 'metadata')
        ├── onLoadedMetadata → video.currentTime = 0.5  (seek à 0.5s)
        ├── onSeeked → CanvasElement.drawImage(video, 0, 0)
        ├── canvas.toDataUrl('image/jpeg', 0.8) → base64 → Uint8List
        └── timeout 8s → null si la vidéo ne répond pas

Pour Android natif (video_thumbnailer_stub.dart) : retourne null → icône play statique.
```

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
    ├── saveNote(year, month, day, text)
    │       └── signUpload('YYYY/MM/DD/note.txt', 'text/plain')
    │               └── PUT <signed_url> avec utf8.encode(text)
    │
    ├── fetchMeta(year, month, day)
    │       └── signDownload('YYYY/MM/DD/meta.json')
    │               └── GET <signed_url> → jsonDecode → Map<String, String>
    │
    ├── saveMeta(year, month, day, meta)
    │       └── signUpload('YYYY/MM/DD/meta.json', 'application/json')
    │               └── PUT <signed_url> avec jsonEncode(meta)
    │
    ├── fetchReactions(year, month, day)
    │       └── signDownload('YYYY/MM/DD/reactions.json')
    │               └── GET <signed_url> → jsonDecode → Map<String, List<String>>
    │
    └── saveReactions(year, month, day, reactions)
            └── signUpload('YYYY/MM/DD/reactions.json', 'application/json')
                    └── PUT <signed_url> avec jsonEncode(reactions)
```

---

## GCS — Convention de nommage

```
YYYY/MM/DD/filename.ext       ← photos et vidéos (affichées dans la grille)
YYYY/MM/DD/note.txt           ← note du jour (filtrée hors grille, chargée séparément)
YYYY/MM/DD/meta.json          ← {"filename.jpg": "Chet"} (filtré hors grille)
YYYY/MM/DD/reactions.json     ← {"filename.jpg": ["❤️", "😍"]} (filtré hors grille)

Le prefix seul suffit pour drill-down sans DB :
  listObjects('')              → prefixes = ['2026/']
  listObjects('2026/')         → prefixes = ['2026/02/']
  listObjects('2026/02/')      → prefixes = ['2026/02/22/']
  listObjects('2026/02/22/')   → items = [{name, contentType, size}, ...]
                                 + items filtrés : note.txt, meta.json, reactions.json
                                   exclus de la grille
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
                  ├──▶ _DistanceIndicator → "9 074 km" + "+6h"
                  └──▶ _DaysTogetherBadge → "💍 Jour X ensemble · ថ្ងៃទី X"
                           └── DateTime.now().difference(_coupleStartDate).inDays
                               _coupleStartDate = DateTime(2026, 1, 13)
```

---

## Cache images

```
_FileTile / _PageContent
    └── CachedNetworkImage(
          imageUrl: signedUrl,      ← URL signée (change toutes les heures)
          cacheKey: item.name,      ← clé stable = chemin GCS (YYYY/MM/DD/file.jpg)
          memCacheWidth: 600,       ← grille : décode à 600px max en mémoire
          // ou
          memCacheWidth: 1920,      ← viewer : décode à 1920px max en mémoire
        )

Le cache disque est indexé par cacheKey, pas par imageUrl.
→ même si l'URL signée change après 1h, le cache disque reste valide.
```

### Pourquoi memCacheWidth ?

Un JPEG brut d'appareil photo (ex. Lumix ~8 MB, ~6000×4000 px) décodé à pleine résolution
occupe **~96 MB** en mémoire vive (6000 × 4000 × 4 octets RGBA). Le moteur CanvasKit de
Flutter Web a un budget mémoire limité par onglet dans Chrome Android. Charger 2–3 de ces
images simultanément (grille + préchargement viewer) dépasse le seuil et fait crasher le
renderer → `errorWidget` affiché à tort.

`memCacheWidth` indique à `flutter_cache_manager` de redimensionner l'image lors du décodage :

| Contexte | memCacheWidth | Mémoire décodée |
|----------|---------------|-----------------|
| Grille (_FileTile) | 600 px | ~1–2 MB |
| Viewer (_PageContent) | 1920 px | ~15 MB |
| Sans limitation | — | ~96 MB (crash) |

Le fichier sur disque (IndexedDB) est stocké en taille originale — `memCacheWidth` n'affecte
que la représentation en mémoire vive lors de l'affichage.

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

## Deep links — partage d'une photo

### Format du lien partagé (preview proxy)

Le lien copié par le bouton 🔗 pointe vers le **preview proxy** de chetana.dev — pas directement vers l'app Flutter :

```
https://chetana.dev/api/coffre/preview?y=YYYY&m=MM&d=DD&f=filename.jpg
```

Cet endpoint sert à deux choses simultanément :
- **Bots scrapers** (WhatsApp, Telegram, Facebook) → reçoivent du HTML avec les balises `og:image`
- **Vrais utilisateurs** → redirigés instantanément vers `https://chetlys.vercel.app/?tab=coffre&y=...`

Le lien Flutter cible (après redirect) :

```
https://chetlys.vercel.app/?tab=coffre&y=YYYY&m=MM&d=DD&f=filename.jpg
```

| Paramètre | Valeur | Exemple |
|-----------|--------|---------|
| `tab` | `coffre` | Sélectionne l'onglet Coffre |
| `y` | année à 4 chiffres | `2026` |
| `m` | mois padded | `02` |
| `d` | jour padded | `22` |
| `f` | nom de fichier URL-encodé | `IMG%201234.jpg` |

Les caractères spéciaux dans le nom de fichier (espaces, accents, Unicode) sont encodés avec `Uri.encodeComponent` à la génération et décodés avec `Uri.decodeComponent` à la réception.

### Flux côté expéditeur

```
_FileViewerState._copyLink()
    ├── _buildDeepLink()
    │       └── Uri.encodeComponent(filename)
    │               → "https://chetana.dev/api/coffre/preview?y=2026&m=02&d=22&f=photo.jpg"
    ├── Clipboard.setData(ClipboardData(text: url))
    └── setState(_showCopiedToast = true)
            └── AnimatedOpacity → "Copié · ចម្លង" (2 secondes)
```

### Flux du preview proxy (chetana.dev)

```
Bot scraper WhatsApp/Telegram/FB :
    GET https://chetana.dev/api/coffre/preview?y=2026&m=02&d=22&f=photo.jpg
        │
        preview.get.ts
            ├── signedGetUrl("2026/02/22/photo.jpg")  → URL GCS signée valable 1h
            ├── Construit titre : "Chet & Lys — 22 février 2026"
            └── Retourne HTML :
                    <meta property="og:image" content="https://storage.googleapis.com/...?X-Goog-Signature=...">
                    <meta property="og:title" content="Chet & Lys — 22 février 2026">
                    <script>window.location.replace("https://chetlys.vercel.app/?...")</script>
        │
        Bot lit og:image → télécharge l'image depuis GCS (signed URL valide)
        Bot met en cache l'image ~24h dans ses serveurs
        → Preview photo + titre affichés dans la conversation

Utilisateur humain qui clique :
    GET https://chetana.dev/api/coffre/preview?y=2026&m=02&d=22&f=photo.jpg
        │
        preview.get.ts → génère une nouvelle signed URL fraîche
        → HTML avec JS redirect
        │
    Navigateur exécute window.location.replace(...)
        → https://chetlys.vercel.app/?tab=coffre&y=2026&m=02&d=22&f=photo.jpg
        → Flutter app s'ouvre → navigation directe vers la photo
```

### Flux côté destinataire (Flutter)

```
Ouverture de https://chetlys.vercel.app/?tab=coffre&y=2026&m=02&d=22&f=photo.jpg
    │
    ▼ Flutter web démarre (index.html → main.dart.js)
    │
HomeScreen.initState()
    ├── Uri.base.queryParameters  ← lit les paramètres de l'URL courante
    ├── params['tab'] == 'coffre' → _index = 1
    └── CoffreScreen(
              initialYear: "2026",
              initialMonth: "02",
              initialDay: "22",
              initialFile: "photo.jpg",   ← Uri.decodeComponent appliqué
        )
    │
CoffreScreen.initState()
    └── _year = "2026", _month = "02", _day = "22"
        → DayFilesScreen affiché directement (pas de passage par les listes)
    │
DayFilesScreen (initialFile: "photo.jpg")
    └── _load() → listObjects(prefix)
            └── items chargés
                → indexWhere(filename == "photo.jpg") → idx
                → addPostFrameCallback → _openViewer(idx)
                        └── viewer ouvert sur la bonne photo avec animation
```

### Comportement si la photo n'existe plus

Si `initialFile` ne correspond à aucun item de la liste (photo supprimée), `indexWhere` retourne `-1`, le viewer n'est pas ouvert et l'app affiche simplement la grille du jour — aucune erreur.

### Pas de deep link sur Android natif

Sur Android natif (`flutter run`), `Uri.base.queryParameters` retourne une map vide — les paramètres URL n'existent pas dans ce contexte. La fonctionnalité est donc web-only, ce qui correspond à l'usage cible (Lys sur iPhone via PWA Safari).

### Limitation PWA iOS

Si la PWA est installée sur l'écran d'accueil de l'iPhone, un lien cliqué depuis WhatsApp s'ouvre dans Safari (pas dans la PWA). L'app fonctionne identiquement en mode navigateur — la navigation vers la photo s'effectue normalement. C'est une limitation iOS : les liens externes ne peuvent pas ouvrir une PWA home screen directement.

---

## Notes de limitations connues

- **Multi-upload iOS (Safari)** : Apple limite `UIImagePickerController` à 1 fichier à la fois, même avec `allowMultiple: true`. Pas de workaround côté code.
- **Compression vidéo web** : pas de solution propre sans FFmpeg.wasm (~30 MB). Les vidéos sont uploadées telles quelles.
- **Thumbnail vidéo Android natif** : `video_thumbnailer_stub.dart` retourne `null` → icône play statique. Pour activer sur Android natif, utiliser `video_thumbnail` ou `flutter_ffmpeg`.
- **Compression Android natif** : `image_compressor_stub.dart` est un pass-through. Pour activer la compression sur Android natif, utiliser `flutter_image_compress`.
- **Signed URLs 1h** : si l'app reste ouverte > 1h, les URLs en cache mémoire (`_urlCache`) deviennent invalides. Le cache disque `CachedNetworkImage` ne l'est pas (clé stable). Un refresh manuel (pull-to-refresh) recharge les URLs mémoire.
- **Réactions cross-day** : dans le viewer, les réactions ne sont chargées que pour le jour initial. Les photos chargées par navigation cross-day (±60j) n'ont pas de réactions affichées.
- **Meta.json concurrent** : si Chet et Lys uploadent simultanément, le `saveMeta` du second écrase celui du premier. Risque très faible en pratique (usage personnel à deux).
