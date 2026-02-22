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

## Preview proxy — og:image pour WhatsApp, Telegram, Facebook

### Pourquoi une app Flutter SPA ne peut pas avoir de preview nativement

Quand on partage un lien sur WhatsApp, Telegram ou Facebook, ces applications envoient un **bot scraper** (un robot HTTP) visiter l'URL pour en extraire les métadonnées. Ce bot cherche des balises HTML spéciales appelées **Open Graph** :

```html
<meta property="og:image"       content="https://...">
<meta property="og:title"       content="Chet & Lys — 22 février 2026">
<meta property="og:description" content="Un souvenir partagé">
```

Le problème fondamental avec une SPA (Single Page Application) Flutter Web : l'`index.html` servi par Vercel est **identique pour toutes les URLs**. Il contient uniquement `<script src="main.dart.js">` — le contenu est généré côté client en JavaScript après le chargement. Or, **les bots scrapers n'exécutent pas JavaScript**. Ils lisent uniquement le HTML brut initial.

Résultat : même si on ajoutait des og:tags dans `index.html`, ils seraient statiques (toujours la même image, toujours le même titre) et ne correspondraient jamais à la photo spécifique partagée.

### La solution : un preview proxy côté serveur

Le principe est d'avoir un **endpoint serveur** (`chetana.dev/api/coffre/preview`) qui, lui, peut générer dynamiquement du HTML différent pour chaque photo :

```
Lien copié dans l'app :
  https://chetana.dev/api/coffre/preview?y=2026&m=02&d=22&f=photo.jpg
                 ↑
       chetana.dev peut générer du HTML dynamique
```

Cet endpoint reçoit `y`, `m`, `d`, `f`, génère une signed URL GCS pour l'image, et retourne :

```html
<!DOCTYPE html>
<html><head>
  <meta property="og:image" content="https://storage.googleapis.com/chet-lys-coffre/2026/02/22/photo.jpg?X-Goog-Signature=...">
  <meta property="og:title" content="Chet & Lys — 22 février 2026">
  <meta property="og:description" content="Un souvenir partagé · ការចងចាំរួម">
  <meta http-equiv="refresh" content="0;url=https://chetlys.vercel.app/?tab=coffre&y=2026&m=02&d=22&f=photo.jpg">
  <script>window.location.replace("https://chetlys.vercel.app/?tab=coffre&...");</script>
</head></html>
```

Deux comportements selon qui visite le lien :

| Visiteur | Comportement |
|----------|-------------|
| Bot scraper (WhatsApp, Telegram, FB) | Lit les `og:` tags → extrait l'image, le titre → met en cache la preview |
| Vrai utilisateur (humain) | JS redirect instantané → atterrit sur la PWA Flutter à la bonne photo |

### Pourquoi les scrapers peuvent lire une signed URL GCS

Une **signed URL GCS** est une URL HTTP entièrement publique — aucun header d'authentification n'est requis. La sécurité repose entièrement sur la signature cryptographique encodée dans les query params :

```
https://storage.googleapis.com/chet-lys-coffre/2026/02/22/photo.jpg
  ?X-Goog-Algorithm=GOOG4-RSA-SHA256
  &X-Goog-Credential=service-account%40...
  &X-Goog-Date=20260222T143000Z
  &X-Goog-Expires=3600
  &X-Goog-SignedHeaders=host
  &X-Goog-Signature=a1b2c3d4e5f6...   ← HMAC-SHA256 RSA, forgeable uniquement avec la clé privée
```

N'importe quel client HTTP (bot scraper inclus) peut télécharger cette URL sans credential. GCS vérifie lui-même la signature à chaque requête. C'est exactement le principe conçu pour permettre l'accès temporaire à des ressources privées sans exposer les credentials.

### Chronologie complète d'un partage

```
T+0s  L'utilisateur tape 🔗 dans le viewer
         → Flutter appelle _buildDeepLink()
         → construit https://chetana.dev/api/coffre/preview?y=2026&m=02&d=22&f=photo.jpg
         → copie dans le presse-papier + toast "Copié · ចម្លង"

T+1s  L'utilisateur colle le lien dans WhatsApp et envoie

T+2s  Bot scraper WhatsApp visite l'URL
         → GET https://chetana.dev/api/coffre/preview?y=2026&m=02&d=22&f=photo.jpg
         → preview.get.ts : signedGetUrl("2026/02/22/photo.jpg") → URL signée valide 1h
         → Retourne le HTML avec og:image pointant vers la signed URL
         → Bot lit og:image, télécharge l'image depuis GCS (signed URL encore valide)
         → Met en cache l'image + métadonnées dans les serveurs WhatsApp

T+3s  Preview affichée dans la conversation — vignette de la photo avec titre

T+? h Le destinataire clique sur le lien
         → Navigateur visite https://chetana.dev/api/coffre/preview?...
         → preview.get.ts génère une NOUVELLE signed URL (fraîche, valide 1h)
         → HTML servi → JS redirect vers https://chetlys.vercel.app/?tab=coffre&...
         → Flutter app s'ouvre, viewer sur la bonne photo
```

La signed URL dans le HTML peut avoir expiré depuis le scraping, mais ça n'a aucune importance : WhatsApp/Telegram ont déjà téléchargé et mis en cache l'image au moment du scraping. Quand un vrai utilisateur clique, `preview.get.ts` génère une **nouvelle** signed URL fraîche.

### Pourquoi l'endpoint preview n'a pas besoin d'auth

Les autres endpoints du coffre requièrent `Authorization: Bearer <google_id_token>`. Le preview n'en a pas. Justification :

- Les bots scrapers ne peuvent pas fournir un Bearer token
- L'accès est limité au `preview` (HTML + og:image) — pas au listing de fichiers, pas à l'upload
- Pour accéder à une photo, il faut connaître le chemin exact `y/m/d/filename` — pas devinable
- C'est une app privée à deux utilisateurs, pas un service public

### Cache des scrapers

| Plateforme | Durée de cache de la preview |
|------------|------------------------------|
| WhatsApp | ~24h — re-scrappe si le lien est partagé à nouveau après 24h |
| Telegram | ~24h — preview stable une fois générée |
| Facebook Messenger | ~24h — contrôlable via l'outil de débogage OG de Meta |

Cela signifie qu'une photo supprimée de GCS continuera à apparaître en preview dans les conversations pendant ~24h — comportement acceptable et attendu.

### Bug critique rencontré en production : `&` vs `&amp;` dans les attributs HTML

#### Symptôme

Facebook ne montrait aucune preview image malgré un endpoint qui semblait fonctionner. Le HTML était bien retourné, la signed URL bien générée — mais pas d'image.

#### Diagnostic

En inspectant le HTML brut retourné par l'endpoint (sans suivre les redirects), le tag `og:image` contenait :

```html
<meta property="og:image" content="https://storage.googleapis.com/...?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=...&X-Goog-Date=...&X-Goog-Expires=3600&X-Goog-SignedHeaders=host&X-Goog-Signature=...">
```

Les `&` dans la query string de la signed URL **n'étaient pas échappés** en `&amp;`.

#### Cause

La spécification HTML exige que le caractère `&` dans les valeurs d'attributs soit toujours encodé en `&amp;`. Les parsers HTML stricts (dont ceux des bots scrapers de Facebook, WhatsApp, Telegram) lisent le contenu d'un attribut jusqu'au premier `&` non échappé et **tronquent l'URL à cet endroit**.

Une signed URL GCS contient systématiquement plusieurs `&` dans ses query params :

```
?X-Goog-Algorithm=GOOG4-RSA-SHA256
&X-Goog-Credential=...      ← premier & → URL tronquée ici par le parser HTML
&X-Goog-Date=...
&X-Goog-Expires=3600
&X-Goog-SignedHeaders=host
&X-Goog-Signature=...
```

Résultat : Facebook recevait une URL invalide (tronquée avant `X-Goog-Credential`), tentait de charger une ressource GCS sans signature valide, obtenait une erreur 403, et abandonnait la preview image.

#### Fix

Avant d'injecter une URL dans un attribut HTML, tous les `&` sont remplacés par `&amp;` :

```typescript
const imageUrlHtml  = imageUrl.replace(/&/g, '&amp;')
const flutterUrlHtml = flutterUrl.replace(/&/g, '&amp;')
```

Les variables `*Html` sont utilisées dans les attributs HTML (`content=`, `href=`), tandis que les variables brutes sont réservées au JavaScript (`window.location.replace(JSON.stringify(flutterUrl))`) — le JS n'est pas du HTML et n'a pas besoin d'échappement HTML.

```html
<!-- Attribut HTML : &amp; obligatoire -->
<meta property="og:image" content="https://storage.googleapis.com/...?X-Goog-Algorithm=GOOG4-RSA-SHA256&amp;X-Goog-Credential=...">

<!-- JavaScript : URL brute, JSON.stringify gère l'échappement JS -->
<script>window.location.replace("https://chetlys.vercel.app/?tab=coffre&y=2026&m=01&d=13&f=photo.jpg");</script>
```

#### Forcer le re-scrape Facebook

Facebook met en cache les résultats de scraping ~24h. Après un fix sur l'endpoint, il faut forcer un nouveau scrape via l'outil officiel :

**https://developers.facebook.com/tools/debug/** → coller l'URL → "Scrape Again"

Cet outil affiche également les erreurs de parsing og:image, ce qui est utile pour diagnostiquer ce type de problème.

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
