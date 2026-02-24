# Choix techniques

> Ce document couvre les décisions architecturales importantes, les bugs rencontrés en production,
> et les solutions retenues. Essentiel à lire avant de modifier le backend ou le système de partage.

---

## Pourquoi SvelteKit plutôt que Flutter Web ?

L'app était initialement en Flutter (conservé dans `app-flutter/`). La migration vers SvelteKit s'est imposée pour plusieurs raisons :

| Critère | Flutter Web | SvelteKit |
|---------|-------------|-----------|
| Build Vercel | ❌ Impossible (pas de Flutter sur Vercel CI) | ✅ Natif |
| Taille du bundle | ~2 MB WASM CanvasKit | ~50 KB JS |
| Temps de démarrage | ~3–5s (chargement WASM) | <1s |
| Rendu | CanvasKit (canvas custom) | HTML/CSS natif |
| Accessibilité | Limitée | Native |
| Maintenance | Build commité dans git | CI automatique |

La contrainte principale avec Flutter était de devoir **committer `build/web`** dans le repo car Vercel ne peut pas compiler Flutter. Chaque déploiement nécessitait : `flutter build web --release && git add build/web && git commit && git push`. SvelteKit élimine complètement cette friction.

---

## Pourquoi une PWA et pas une app native ?

- **Lys est sur iPhone** : distribuer une app iOS sans compte Apple Developer ($99/an) est impossible officiellement
- **Solution** : PWA installable depuis Safari → Lys l'ajoute à son écran d'accueil en deux taps
- **Comportement app** : plein écran (`standalone`), pas de barre Safari, `safe-area-inset-bottom` géré

---

## Stockage GCS sans base de données

Le coffre stocke photos et vidéos directement dans **Google Cloud Storage**. La hiérarchie `YYYY/MM/DD/` remplace un schéma de DB.

### Avantages
- **Zéro schéma** : ajouter une date ne demande aucune migration
- **Listing natif** : `listObjects(prefix, delimiter: '/')` retourne les prefixes du niveau suivant
- **Signed URLs** : sécurité sans proxy — le backend génère une URL signée, le client accède directement à GCS
- **Coût minimal** : GCS Standard ~$0.02/GB/mois

### Fichiers spéciaux par jour

| Fichier | Format | Rôle |
|---------|--------|------|
| `note.txt` | texte brut | Note personnelle du jour |
| `meta.json` | `{filename: prénomUploader}` | Qui a uploadé quoi |
| `reactions.json` | `{filename: ["❤️", "😍"]}` | Réactions emoji par photo |

Ces trois fichiers sont filtrés hors de la grille (`isMediaFile()` dans `api.ts`) mais chargés séparément.

---

## Signed URLs v4

Générées côté backend (`chetana.dev`) avec HMAC-SHA256 v4, implémenté en Node.js natif (module `crypto`) — le SDK `@google-cloud/storage` ne survit pas au bundling Nitro/Rollup.

- **PUT signed URL** (upload) : expire après 15 minutes
- **GET signed URL** (téléchargement) : expire après 1 heure

Le cache des signed URLs dans le client (`urlCache` dans `DayFiles.svelte`) utilise le chemin GCS comme clé — stable, contrairement à l'URL signée qui change chaque heure.

---

## Preview proxy — og:image pour WhatsApp, Telegram, Facebook

### Pourquoi une SPA ne peut pas avoir de preview nativement

Quand on partage un lien sur WhatsApp/Telegram/Facebook, un **bot scraper** visite l'URL pour extraire les balises Open Graph :

```html
<meta property="og:image"  content="...">
<meta property="og:title"  content="Chet & Lys — 22 février 2026">
```

Problème : une SPA (SvelteKit en mode CSR, ou même SSR sans données) retourne un HTML générique. Le bot ne voit pas les métadonnées spécifiques à la photo.

**Solution** : l'endpoint `chetana.dev/api/coffre/preview` génère dynamiquement du HTML avec les bonnes balises og:image pour chaque photo.

### Flux complet

```
T+0  Utilisateur tap 🔗 dans le viewer
       → construit https://chetana.dev/api/coffre/preview?y=2026&m=02&d=22&f=photo.jpg
       → copie dans le presse-papier + toast "Copié · ចម្លង"

T+1  Utilisateur colle le lien dans WhatsApp et envoie

T+2  Bot scraper WhatsApp visite l'URL
       → preview endpoint génère une signed URL GCS fraîche
       → retourne HTML avec og:image pointant vers /api/coffre/og-image?path=...
       → Bot télécharge l'image JPEG depuis le proxy og-image
       → Met en cache dans les serveurs WhatsApp ~24h

T+3  Preview visible dans la conversation

T+?  Destinataire clique le lien
       → preview endpoint génère une NOUVELLE signed URL fraîche
       → HTML → JS redirect vers https://chetlys.vercel.app/coffre?y=&m=&d=&f=
       → SvelteKit ouvre le viewer sur la bonne photo
```

### Pourquoi le proxy og-image (`/api/coffre/og-image`)

Les scrapers ont des exigences différentes sur les formats d'image :

| Scraper | User-Agent | Formats acceptés | WebP |
|---------|-----------|-----------------|------|
| WhatsApp | `WhatsApp/2.x` | JPEG, PNG, WebP | ✅ |
| Facebook Messenger | `facebookexternalhit/1.1` | JPEG, PNG, GIF | ❌ |
| Telegram | `TelegramBot` | JPEG, PNG | ⚠️ partiel |

Facebook Messenger (scraper historique `facebookexternalhit/1.1`) n'accepte pas WebP. Le proxy transcode **tout format source** (WebP, HEIC, PNG, RAW…) en JPEG via `sharp` :

```
GET /api/coffre/og-image?path=2026/02/22/photo.webp[&w=300]
    ├── signedGetUrl(path) → URL GCS signée
    ├── fetch(signedUrl)   → télécharge l'original
    ├── width = query.w ?? 1200
    ├── sharp(buffer).resize({ width }).jpeg({ quality: w≤400 ? 80 : 85 })
    └── Retourne image/jpeg — Cache-Control: public, max-age=86400
```

**Double usage** :
| Usage | `?w=` | Taille typique |
|-------|-------|----------------|
| og:image social | 1200 (défaut) | ~150–400 KB |
| Thumbnail grille | 300 | ~10–30 KB |

### Bug critique : `&` vs `&amp;` dans les attributs HTML

**Symptôme** : Facebook ne montrait aucune preview malgré un endpoint fonctionnel.

**Cause** : une signed URL GCS contient plusieurs `&` dans ses query params. En HTML, `&` dans un attribut doit être échappé en `&amp;`. Les scrapers utilisent des parsers HTML stricts qui **tronquent l'URL au premier `&` non échappé**.

```
URL tronquée par le parser HTML :
https://storage.googleapis.com/...?X-Goog-Algorithm=GOOG4-RSA-SHA256
                                                                       ↑
                                                     &X-Goog-Credential=... (ignoré)
```

**Fix** : dans les attributs HTML, remplacer `&` par `&amp;` :
```typescript
const imageUrlHtml = imageUrl.replace(/&/g, '&amp;')
// Utilisé dans content="..." — pas dans le JS window.location.replace()
```

**Outil de debug Facebook** : https://developers.facebook.com/tools/debug/
→ "Scrape Again" pour forcer le re-cache après un fix.

---

## Semaphore signDownload — max 3 requêtes simultanées

### Problème

Sur un jour avec 25+ photos, 25 appels `signDownload()` simultanés saturent :
- Les fonctions serverless Vercel (cold starts)
- Le réseau mobile (buffer saturé)
→ Timeouts → images cassées dans la grille

### Solution

`Semaphore` dans `semaphore.ts` limite à 3 les `signDownload` concurrents. Les suivants attendent dans une queue et sont débloqués au fur et à mesure.

```typescript
// Pourquoi 3 ?
// 1 → trop lent (séquentiel)
// 3 → pipeline efficace sans saturer le réseau mobile ← choix retenu
// 10+ → retour aux problèmes de saturation
```

Double vérification du cache après attente : si deux tuiles demandent la même URL, la seconde lit le cache rempli par la première sans refaire la requête.

---

## Proxy og-image pour les thumbnails de grille

Les photos brutes d'appareil (ex. Lumix JPEG ~8 MB, 6000×4000 px) ne doivent **jamais** arriver sur le client pour les thumbnails. Décoder un JPEG 8 MB occupe ~96 MB GPU. Sur une grille de 9 tuiles : pics mémoire catastrophiques sur mobile.

**Solution** : utiliser `/api/coffre/og-image?path=...&w=300` comme source des thumbnails. Le serveur renvoie un JPEG déjà à 300px (~15 KB). Le client ne voit jamais l'original.

```typescript
// FileTile.svelte
const imgSrc = isVideo ? videoThumb : ogImageUrl(name, 300);
// ogImageUrl() → https://chetana.dev/api/coffre/og-image?path=...&w=300
```

Avantage secondaire : HEIC, WebP, RAW — tous transcodes en JPEG → compatibilité universelle.

---

## Réactions emoji — architecture simplifiée

Un seul `reactions.json` par jour (pas un fichier par photo, pas de DB).

**Justification** : 2 utilisateurs, quelques dizaines de photos max → risque de conflit d'écriture concurrent quasi nul. Un seul `signDownload` + `GET` charge toutes les réactions du jour.

**Optimistic update** : l'UI est mise à jour immédiatement, la persistance GCS est asynchrone.

---

## Auth Google — GSI One Tap

`auth.ts` utilise Google Identity Services (GSI) :
- Auto-select au chargement si une session existe
- Token JWT stocké en `sessionStorage` (même session uniquement, pas `localStorage`)
- Expiration vérifiée à la restauration (`exp * 1000 > Date.now()`)
- `getToken()` retourne le JWT courant → `Authorization: Bearer <token>` sur tous les appels API

---

## Cache signed URLs (DayFiles)

`urlCache = new Map<string, string>()` dans `DayFiles.svelte` — en mémoire, clé = chemin GCS.

Limites :
- Invalidé à chaque changement de jour (composant remonte)
- Après 1h, les URLs expirent — un rechargement de la page les rafraîchit
- Pas de cache disque (contrairement à `cached_network_image` en Flutter) — SvelteKit s'appuie sur le cache HTTP du navigateur via `Cache-Control: max-age=86400` du proxy og-image

---

## Note du jour — bug synchronisation (résolu)

**Symptôme** : après sauvegarde d'une note, la préview affichait l'ancien texte.

**Cause** : `handleNoteSave()` sauvegardait en GCS mais ne mettait pas à jour le state local `note`.

**Fix** : mettre à jour `note = text` en même temps que le `saveNote()` API call (optimistic update).

```typescript
// DayFiles.svelte
async function handleNoteSave(text: string) {
    note = text;                              // ← mise à jour immédiate du state local
    await apiSaveNote(year, month, day, text); // ← persistance GCS async
}
```

**Leçon** : dans un pattern "sauvegarde optimiste", toujours mettre à jour **toutes** les variables d'état concernées simultanément.

---

## Limitations iOS PWA

- Un lien cliqué depuis WhatsApp s'ouvre dans Safari (pas dans la PWA installée) — limitation iOS, pas de workaround
- Upload multi-fichiers : Apple limite le picker à 1 fichier à la fois sur Safari iOS
- Les liens sharés fonctionnent identiquement en mode navigateur et en mode PWA

---

## Dépendances notables

| Package | Rôle |
|---------|------|
| `date-fns` + `date-fns-tz` | Formatage dates bilingues + timezones IANA |
| `@sveltejs/adapter-vercel` | Deploy Vercel avec SSR/CSR hybride |

Volontairement sans state management externe (Pinia, Zustand, etc.) — `$state` / `$derived` Svelte 5 suffisent.

---

## Désactivation SSR — bug 500 en production (résolu)

**Symptôme** : `GET https://chetlys.vercel.app/coffre 500 (Internal Server Error)` dès l'arrivée sur la page.

**Cause** : SvelteKit tenait d'exécuter les composants côté serveur (Vercel Edge). Or `coffre/+page.svelte` utilise des APIs purement browser : `sessionStorage` (auth token), `history.pushState` (deep links), `window.google` (GSI One Tap). Ces APIs n'existent pas en Node.js → crash immédiat.

**Fix** : créer `src/routes/+layout.ts` avec une seule ligne :

```typescript
// src/routes/+layout.ts
export const ssr = false;
```

Ce fichier désactive le SSR pour **toute l'application**. L'app devient un pur SPA (CSR) — Vercel sert un index.html statique, SvelteKit démarre côté client.

**Pourquoi ce fichier n'existait pas avant** : le projet Flutter exportait déjà un build statique. Lors de la migration SvelteKit, le SSR a été laissé activé par défaut, ce qui fonctionnait en dev (Vite ne fait pas de vrai SSR) mais crashait en prod.

---

## Double appels API au chargement (résolu)

**Symptôme** : au chargement d'un jour (`DayFiles`), les endpoints `note`, `meta`, et `reactions` étaient appelés **deux fois** chacun.

**Cause** : `onMount` appelait `loadAll()` (note + meta + reactions) ET un `$effect` appelait aussi `loadAll()`. En Svelte 5, `$effect` s'exécute **immédiatement** au montage du composant, puis à nouveau si ses dépendances réactives changent — donc au premier rendu, les deux se déclenchaient en même temps.

**Fix** : supprimer `loadAll()` de `onMount`, le garder uniquement dans `$effect`.

```typescript
// DayFiles.svelte — AVANT (double appel)
onMount(() => {
    loadDays();
    loadAll();       // ← déclenché au montage
});
$effect(() => {
    loadAll();       // ← aussi déclenché au montage → 2× chaque appel
});

// APRÈS (un seul appel)
onMount(() => {
    loadDays();      // ← load unique au montage
});
$effect(() => {
    loadAll();       // ← s'exécute au montage + si year/month/day changent
});
```

**Leçon** : ne jamais appeler la même fonction dans `onMount` et dans `$effect`. `$effect` couvre déjà le cas "au montage".

---

## Architecture de scroll — chaque vue gère son propre scroll

**Problème initial** : `main` dans `+layout.svelte` avait `overflow-y: auto`, ce qui créait un seul scroller global. Avec DayFiles qui essayait d'occuper toute la hauteur, ça bloquait le scroll ou le rendait erratique.

**Pattern retenu** : les containers parents ne scrollent pas — ils transmettent la hauteur. Chaque vue leaf gère son propre scroll.

```
+layout.svelte → main { overflow: hidden; display: flex; flex-direction: column }
    ↓
coffre/+page.svelte → .content { overflow: hidden; display: flex; flex-direction: column }
    ├── YearList / MonthList / DayList → enveloppés dans .list-scroll { flex: 1; overflow-y: auto }
    └── DayFiles → { height: 100%; overflow: hidden }
            └── .grid { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch }

horloge/+page.svelte → .page { height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch }
```

**Règle** : dès qu'un composant a besoin de scroller, il ajoute `overflow-y: auto` à son propre conteneur. Les parents utilisent `overflow: hidden` + `min-height: 0` pour que le flex ne dépasse pas.

---

## Grille photo carrée — calcul JS obligatoire

**Problème** : obtenir des tuiles carrées dans une CSS Grid where le nombre de colonnes vient d'une variable réactive Svelte.

**Tentative naïve** (ne fonctionne pas) :
```css
.grid {
    grid-auto-rows: calc((100vw - var(--space-1) * (var(--cols) + 1)) / var(--cols));
}
```
CSS ne peut pas **diviser par une custom property** (`var(--cols)` est une chaîne, pas un nombre). Le navigateur ignore le `calc()` entier.

**Solution** : calculer la taille de cellule en JS là où `columns` est un vrai nombre, puis l'injecter comme custom property résolue :

```svelte
<!-- DayFiles.svelte -->
<div
    class="grid"
    style="--cols: {columns}; --cell-size: calc((100vw - {columns + 1} * var(--space-1)) / {columns})"
>
```

```css
.grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-auto-rows: var(--cell-size);   /* ← fonctionne car --cell-size est déjà résolu */
}
```

`--cell-size` contient un `calc()` avec une valeur numérique littérale (`{columns + 1}` = ex. `4`), pas une custom property → le navigateur peut le résoudre.

**FileTile** : les tuiles utilisent `width: 100%; height: 100%` pour remplir exactement la cellule définie par `grid-auto-rows`.

---

## Thumbnails carrés côté serveur (og-image proxy)

**Problème** : le proxy `og-image` retournait des images aux proportions originales (paysage, portrait…). Dans la grille carrée, les images n'étaient pas centrées/cropées.

**Fix** dans `chetana.dev/server/api/coffre/og-image.get.ts` : pour `w <= 600` (usage thumbnail), sharp crop carré centré :

```typescript
const isThumb = width <= 600
const jpeg = await sharp(buffer)
    .resize(isThumb
        ? { width, height: width, fit: 'cover', position: 'centre', withoutEnlargement: true }
        : { width, withoutEnlargement: true }
    )
    .jpeg({ quality: width <= 400 ? 80 : 85 })
    .toBuffer()
```

`fit: 'cover'` + `position: 'centre'` = crop centré, comme `object-fit: cover` en CSS. Les images verticales (portrait) sont cropées en haut/bas, les horizontales sur les côtés.

---

## Système de design — variables CSS

Toutes les valeurs hardcodées (px, rem) ont été remplacées par des tokens CSS définis dans `app.css` :

| Catégorie | Variables | Exemple |
|-----------|-----------|---------|
| Espacement | `--space-1` … `--space-16` | `--space-1: 0.25rem` |
| Typographie | `--fs-xs` … `--fs-3xl` | `--fs-base: 1rem` |
| Bordures | `--radius-sm` … `--radius-full` | `--radius-full: 9999px` |
| Boutons | `--btn-fab`, `--btn-tap` | `--btn-fab: 3.5rem` |
| Navigation | `--nav-height` | `--nav-height: 4rem` |

**Composants mis à jour** : `NoteField`, `FabUpload`, `Breadcrumb`, `YearList`, `MonthList`, `DayList`, `FileViewer`, `horloge/+page.svelte`, `+layout.svelte`.

**Règle** : ne jamais écrire une valeur px ou rem dans un style composant. Toujours référencer un token. Exception : les valeurs dérivées de calculs dynamiques (ex. `grid-auto-rows`) qui nécessitent une interpolation JS.

---

## Compression images upload — pipeline complet

`src/lib/compressor.ts` transforme les fichiers avant upload :

```
compressImage(file)
    ├── Si non-image (vidéo) → retourne l'original sans traitement
    ├── createImageBitmap() → extrait les dimensions
    ├── Resize si > 2048px (côté long) en conservant le ratio
    ├── Canvas → toBlob('image/webp', 0.85)
    │       Si webpBlob.size < original → upload WebP (Chrome, Android)
    ├── Canvas → toBlob('image/jpeg', 0.85)
    │       Si jpegBlob.size < original → upload JPEG (Safari iOS)
    └── Fallback → original si les deux sont plus lourds (rare)
```

Gains observés :
- HEIC 5 MB → JPEG ~700 KB sur Safari (−86%)
- JPEG 3 MB → WebP ~300 KB sur Chrome (−90%)
- PNG 2 MB → WebP ~150 KB (−93%)

**Important** : WebP n'est pas supporté par `toBlob` sur Safari iOS → Safari produit automatiquement du JPEG. Chrome produit du WebP. Les deux sont compatibles avec le proxy og-image côté serveur (sharp transcodes tout en JPEG de toute façon).

---

## meta `mobile-web-app-capable` (Chrome PWA)

`app.html` avait uniquement `apple-mobile-web-app-capable` (pour Safari/iOS). Chrome avait un avertissement de dépréciation car la valeur standard est `mobile-web-app-capable`.

**Fix** : ajouter les deux :
```html
<meta name="mobile-web-app-capable" content="yes" />       <!-- Chrome, Android -->
<meta name="apple-mobile-web-app-capable" content="yes" /> <!-- Safari, iOS -->
```
