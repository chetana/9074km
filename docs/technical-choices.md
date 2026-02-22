# Choix techniques

## Pourquoi Flutter ?

### Le problème de départ

L'objectif est une application couple utilisée par deux personnes sur deux plateformes différentes :
- **Chet** → Android (téléphone personnel)
- **Lys** → iPhone (iOS, Phnom Penh)

Distribuer une app iOS sans compte Apple Developer ($99/an) est impossible officiellement. Les alternatives gratuites (AltStore, Sideloadly) expirent tous les 7 jours et nécessitent un ordinateur à portée. Le jailbreak est exclu.

**Solution** : une PWA (Progressive Web App) installable depuis Safari — aucun store, aucun frais. Lys l'ajoute à son écran d'accueil depuis Safari en deux taps, et elle se comporte comme une vraie app (plein écran, pas de barre de navigation).

---

### Un seul codebase, deux cibles

| Besoin | Solution |
|--------|----------|
| App Android native | `flutter run` / `flutter build apk` |
| PWA installable iPhone | `flutter build web` → Vercel |
| Pas de duplication de code | Même `lib/` pour les deux |
| Pas de backend (horloge stateless) | Tout calculé côté client (timezone, heure) |

Flutter compile le même code Dart vers :
- **Android** : bytecode ARM natif (AOT compilation)
- **Web** : JavaScript via `dart2js` + rendu CanvasKit (WebAssembly)

Sans Flutter, l'alternative aurait été d'écrire deux apps séparées (Kotlin + React/Vue) ou de choisir entre l'une ou l'autre cible. Flutter résout ça avec **un seul langage, un seul projet**.

---

## Pourquoi pas React Native ?

| Critère | Flutter | React Native |
|---------|---------|--------------|
| Support Web mature | ✅ `flutter build web` officiel | ⚠️ React Native Web, moins intégré |
| PWA out-of-the-box | ✅ manifest.json généré | ❌ configuration manuelle |
| Rendu cohérent cross-platform | ✅ CanvasKit (même moteur partout) | ❌ composants natifs → UI différente |
| Pas de JavaScript à écrire | ✅ Dart uniquement | ❌ JS/TS obligatoire |
| Stack déjà connue | ✅ Dart simple à apprendre | — |

---

## Pourquoi pas une web app classique (Vue/Nuxt) ?

L'alternative aurait été d'ajouter une route `/chet-lys` sur `chetana.dev` (Nuxt 3). C'est une option viable, mais :

- **Pas de mobile natif** : Nuxt ne produit pas d'APK Android. Il faudrait deux projets séparés.
- **GitHub diversity** : Le repo `9074km` en Flutter ajoute Dart à la couverture de langages du profil GitHub, ce que Vue/Nuxt (déjà présent sur chetana.dev) n'apporterait pas.
- **App shell** : Flutter Web en mode `standalone` donne une vraie sensation d'app (transitions, pas de scroll bounce, barre de status) qu'une page web classique reproduit moins bien sur mobile.

---

## Pourquoi Vercel pour le web ?

- **Même infra que chetana.dev** : même workflow (`vercel --prod`), même tableau de bord.
- **Free tier suffisant** : app statique, zéro backend, zéro base de données → aucun coût.
- **CDN global** : les assets Flutter Web (CanvasKit WASM ~2 MB) sont servis depuis l'edge node le plus proche de Lys à Phnom Penh.
- **HTTPS automatique** : requis pour les PWA (Service Worker ne fonctionne qu'en HTTPS).

### Contrainte : pas de build Flutter sur Vercel

Vercel ne propose pas Flutter dans ses environnements de build. La stratégie adoptée est de **committer `build/web`** dans le repo git :

```
.gitignore :
  /build/*          ← ignore tout build/
  !/build/web       ← sauf build/web (web compilé)
```

À chaque modification du code :
```bash
flutter build web --release
git add build/web
git commit -m "..."
vercel --prod
```

C'est le seul fichier de build commité — les artefacts Android (`build/app`, 1.1 GB) restent ignorés.

---

## Pourquoi Puro comme gestionnaire Flutter ?

[Puro](https://puro.dev) est un gestionnaire de versions Flutter alternatif au SDK officiel. Il permet d'installer Flutter sans modifier le PATH global et de gérer plusieurs versions en parallèle.

```bash
winget install puro
puro create stable      # télécharge Flutter stable dans ~/.puro/envs/stable/
~/.puro/envs/stable/flutter/bin/flutter.bat run
```

Avantage principal : isolation propre, pas de conflit avec d'autres outils SDK.

---

## Stockage GCS plutôt qu'une base de données

Le coffre à souvenirs stocke les photos et vidéos directement dans **Google Cloud Storage**, sans aucune base de données. La hiérarchie `YYYY/MM/DD/` dans les noms de fichiers remplace entièrement un schéma de DB.

### Avantages
- **Zéro schéma** : ajouter une année, un mois, un jour ne demande aucune migration
- **Listing natif** : `listObjects(prefix, delimiter: '/')` retourne exactement les prefixes du niveau suivant
- **Signed URLs** : sécurité sans proxy — l'app demande une URL signée au backend, puis accède directement à GCS. Le backend ne transit jamais les bytes des fichiers.
- **Coût minimal** : GCS Standard europe-west1 ≈ $0.02/GB/mois. Pour un usage couple (quelques GB/an), pratiquement gratuit.

### Fichiers spéciaux par jour

En plus des médias, trois fichiers JSON enrichissent chaque jour :

| Fichier | Format | Rôle |
|---------|--------|------|
| `note.txt` | texte brut | Note personnelle du jour |
| `meta.json` | `{filename: prénomUploader}` | Qui a uploadé quoi |
| `reactions.json` | `{filename: ["❤️", "😍"]}` | Réactions emoji par photo |

Ces trois fichiers sont filtrés hors de la grille d'affichage mais chargés séparément.

### Signed URLs v4

Les URLs signées sont générées côté backend (chetana.dev) avec l'algorithme HMAC-SHA256 v4 de GCS, implémenté en Node.js natif (module `crypto`) plutôt que via le SDK `@google-cloud/storage` qui ne survit pas au bundling Nitro/Rollup.

- **PUT signed URL** (upload) : expire après 15 minutes
- **GET signed URL** (téléchargement/affichage) : expire après 1 heure

---

## Imports conditionnels Dart (pattern web/stub)

Deux fonctionnalités utilisent des API web (`dart:html`) non disponibles sur Android natif : la compression d'images et la génération de thumbnails vidéo. Le pattern d'import conditionnel Dart permet un seul fichier d'entrée :

```dart
// image_compressor.dart
export 'image_compressor_stub.dart'
    if (dart.library.html) 'image_compressor_web.dart';

// video_thumbnailer.dart
export 'video_thumbnailer_stub.dart'
    if (dart.library.html) 'video_thumbnailer_web.dart';
```

- Sur **web** : `dart.library.html` est vrai → implémentation canvas réelle
- Sur **Android** : `dart.library.html` est faux → stub (pass-through ou `null`)

Ce pattern évite les `kIsWeb` dispersés dans le code et permet une compilation sans erreur sur les deux cibles.

---

## Cache images : `cached_network_image`

Les images dans la grille et le viewer sont servies via des signed URLs GCS qui expirent après 1 heure. Utiliser `Image.network` directement forcerait un nouveau téléchargement à chaque rebuild de widget.

`cached_network_image` résout ce problème en deux dimensions :

| Paramètre | Valeur | Rôle |
|-----------|--------|------|
| `imageUrl` | signed URL (change chaque heure) | Source de téléchargement |
| `cacheKey` | `item.name` (ex: `2026/02/22/photo.jpg`) | **Clé du cache disque** |

La clé de cache est le chemin GCS — stable et unique — indépendamment de l'URL signée. Même après l'expiration de l'URL, l'image est servie depuis le cache disque sans réseau.

### `memCacheWidth` — limitation de la mémoire décodée

Les signed URLs expirent après 1h mais les images restent en cache disque. Le problème distinct est la mémoire vive au moment du décodage.

Un appareil photo Lumix produit des JPEG de ~8 MB (6000×4000 px). Lors du décodage Flutter :

```
6000 × 4000 × 4 octets (RGBA) = 96 MB par image
```

CanvasKit (moteur de rendu Flutter Web) a des limites de mémoire par onglet. Charger 2 à 3 images de cette taille simultanément crashe le renderer → errorWidget affiché au lieu de l'image.

**Solution** : paramètre `memCacheWidth` de `CachedNetworkImage` qui force le décodage à une largeur maximale :

| Contexte | `memCacheWidth` | Mémoire décodée | Qualité |
|----------|----------------|-----------------|---------|
| Grille (thumbnail) | `600` | ~1–2 MB | Suffisante pour miniature |
| Viewer plein écran | `1920` | ~15 MB | Suffisante pour écran Full HD |
| Sans limite | — | ~96 MB | Crash renderer sur Lumix RAW |

Flutter redimensionne l'image au décodage lui-même (pas via CSS), donc l'économie est réelle et ne dépend pas du navigateur.

---

## Réactions emoji — architecture simplifiée

Les réactions sont stockées dans un seul fichier `reactions.json` par jour (pas un fichier par photo, pas une base de données). Ce choix est justifié par :

- **Usage faible** : 2 utilisateurs, quelques dizaines de photos par jour au maximum
- **Atomicité acceptable** : le risque de conflit d'écriture concurrent est quasi nul
- **Lecture unique** : un seul `signDownload` + `GET` pour charger toutes les réactions du jour

### Flux de mise à jour

```
Viewer: tap sur ❤️
  → _reactions[filename].toggle('❤️')
  → setState() → UI réactive immédiatement
  → widget.onReactionsChanged(updated) → _DayFilesScreenState._reactions
  → saveReactions() → PUT reactions.json (async, en arrière-plan)
```

L'UI répond instantanément (optimistic update), la persistance GCS est asynchrone.

---

## Thumbnails vidéo — choix de l'implémentation web

Le package `video_thumbnail` (pub.dev) ne supporte pas le web. Les alternatives :

| Option | Pour | Contre |
|--------|------|--------|
| `video_thumbnail` | Simple | ❌ pas de support web |
| `FFmpeg.wasm` | Universel | ❌ ~30 MB de bundle, latence |
| HTMLVideoElement + Canvas | ✅ Natif navigateur, ~0 KB | ❌ web uniquement |

L'implémentation retenue (`video_thumbnailer_web.dart`) :
1. Crée un `<video>` HTML invisible avec l'URL signée
2. Sur `loadedmetadata` → seek à 0.5 secondes
3. Sur `seeked` → dessine la frame dans un `<canvas>`, exporte en JPEG base64
4. Timeout 8s → `null` si la vidéo est inaccessible

Sur Android natif, le stub retourne `null` → fallback vers l'icône play statique. Pour une thumbnail native Android, `video_thumbnail` (avec `path_provider`) serait l'option appropriée.

---

## Deep links — pourquoi des query params et pas un router

Flutter propose plusieurs solutions pour les deep links web : `go_router`, `auto_route`, ou le routing natif `Navigator 2.0`. Ces packages ont été volontairement évités pour cette fonctionnalité.

### Pourquoi pas go_router ?

| Critère | go_router | Query params manuels |
|---------|-----------|---------------------|
| Complexité ajoutée | ⚠️ Refactoring complet de la navigation | ✅ 20 lignes dans `initState` |
| Navigation state-based existante | ❌ Incompatible sans réécriture | ✅ Aucun changement d'architecture |
| Usage unique | ❌ Sur-ingénierie pour 1 cas d'usage | ✅ Minimal et suffisant |
| Comportement souhaité | Deep link one-shot à l'ouverture | ✅ Lu une fois dans `Uri.base` |

La navigation de l'app est intentionnellement **state-based** (variables `_year/_month/_day` dans `CoffreScreen`). Introduire un router changerait la philosophie du projet sans apporter de valeur pour deux utilisateurs.

### `Uri.base` — disponibilité cross-platform

`Uri.base` est disponible dans Dart sur toutes les plateformes, mais son comportement diffère :
- **Web** : retourne l'URL complète de la page courante, avec queryParameters
- **Android/iOS natif** : retourne une URI sans paramètres significatifs

Ce comportement suffit : sur Android, `queryParameters` est vide → aucun deep link appliqué → comportement normal. Sur web (PWA), les paramètres sont lus et la navigation est appliquée. Aucun conditional import nécessaire.

### Encodage des noms de fichiers

Les noms de fichiers peuvent contenir des espaces, accents ou caractères Unicode (ex: `photo été.jpg`, `IMG 001.heic`). Le cycle complet :

```
Génération  : Uri.encodeComponent("photo été.jpg")
            → "photo%20%C3%A9t%C3%A9.jpg"

Transport   : dans l'URL → copié dans le presse-papier → envoyé via message

Réception   : Uri.base.queryParameters['f']
            → Dart décode automatiquement les %XX → "photo été.jpg"
            → Uri.decodeComponent() en plus pour double sécurité
```

La comparaison finale `item.name.split('/').last == widget.initialFile` compare deux strings décodées → match garanti.

---

## Dépendances

| Package | Version | Rôle |
|---------|---------|------|
| `flutter` | SDK stable | Framework UI cross-platform |
| `timezone` | ^0.10.0 | Base IANA timezones, DST automatique |
| `cupertino_icons` | ^1.0.8 | Icônes iOS style |
| `google_sign_in` | ^6.2.2 | Auth Google (web clientId) |
| `file_picker` | ^8.1.4 | Sélection fichiers multi-plateforme |
| `http` | ^1.2.2 | Requêtes REST (coffre_api) |
| `intl` | ^0.19.0 | Internationalisation (dates) |
| `video_player` | ^2.9.2 | Lecture vidéo bas niveau |
| `chewie` | ^1.8.5 | UI player vidéo (controls, seek bar) |
| `share_plus` | ^10.1.4 | Web Share API (iOS Share Sheet, Android) |
| `cached_network_image` | ^3.4.1 | Cache disque images (cacheKey stable) |

Volontairement sans state management externe (Provider, Riverpod, Bloc) — `setState` suffit pour une app à deux utilisateurs avec navigation state-based.
