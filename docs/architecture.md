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
│   ├── _ClockCard         # Card par personne (heure, date, status)
│   └── _DistanceIndicator # 9 074 km + décalage horaire
│
└── coffre/
    ├── auth_service.dart  # Singleton AuthService — GoogleSignIn web
    ├── coffre_api.dart    # Fonctions REST vers chetana.dev/api/coffre/*
    ├── coffre_screen.dart # Auth gate + routing state + breadcrumb AppBar
    ├── year_list.dart     # YearListBody — liste des années GCS
    ├── month_list.dart    # MonthListBody — liste des mois (FR + KH)
    ├── day_list.dart      # DayListBody — liste des jours (date + FR + KH)
    └── day_files.dart     # DayFilesScreen — chips jours + nav < > + grille + upload + viewer
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
- **Icône calendrier** : `showDatePicker` (thème sombre) → met à jour `_year/_month/_day` directement, utile pour uploader dans une date passée
- **Icône logout** : appelle `AuthService.disconnect()` pour forcer le sélecteur de compte

```
Coffre › 2026 › 02 › 22      [📅]  [logout]
  ↑tap      ↑tap  ↑tap  (courant)
```

### DayFilesScreen — widgets internes

```
DayFilesScreen
├── _DayNavBar         # Barre < prev · nom jour FR+KH · next >
├── _DaysChipBar       # Chips horizontal des jours existants dans le mois
│   └── Chargé via listObjects('YYYY/MM/') — uniquement jours avec contenu
│   └── Chip actif mis en évidence, tap → onDayJump callback → CoffreScreen._day
├── GridView (_FileTile)
│   ├── key: ValueKey(name)   # évite réutilisation d'état sur changement de date
│   ├── Image.network (images)
│   └── play icon (vidéos)
└── _FileViewer (Dialog)
    ├── InteractiveViewer  # pinch-to-zoom pour images
    └── Chewie             # lecteur vidéo (play/pause, seek, fullscreen)
```

### Rechargement réactif

`DayFilesScreen` utilise `didUpdateWidget` pour détecter les changements de date :
- Si `year/month/day` change → `_items = null` + `_load()`
- Si `year/month` change → `_days = null` + `_loadDays()`
Cela permet au parent `CoffreScreen` de changer la date sans recréer le widget.

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
    └── deleteObject(path)
            └── DELETE chetana.dev/api/coffre/delete?path=
                    └── GCS file.delete()
```

---

## GCS — Convention de nommage

```
YYYY/MM/DD/filename.ext
  └── Le prefix seul suffit pour drill-down sans DB :
      listObjects('')         → prefixes = ['2026/']
      listObjects('2026/')    → prefixes = ['2026/02/']
      listObjects('2026/02/') → prefixes = ['2026/02/22/']
      listObjects('2026/02/22/') → items = [{name, contentType, size}]
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
                  ├──▶ _ClockCard (Chet)  → heure / date / status
                  ├──▶ _ClockCard (Lys)   → heure / date / status
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
        ▼ vercel --prod
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
