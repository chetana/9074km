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
| Pas de duplication de code | Même `lib/main.dart` pour les deux |
| Pas de backend (app stateless) | Tout calculé côté client (timezone, heure) |

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

## Dépendances

| Package | Version | Rôle |
|---------|---------|------|
| `flutter` | SDK stable | Framework UI cross-platform |
| `timezone` | ^0.10.0 | Base IANA timezones, DST automatique |
| `cupertino_icons` | ^1.0.8 | Icônes iOS style (non utilisées pour l'instant) |

Volontairement minimal : pas de state management externe (Provider, Riverpod, Bloc) car l'app est stateless — un seul `StatefulWidget` avec un `Timer` suffit.
