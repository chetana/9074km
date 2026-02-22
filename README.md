# 9074km — Chet & Lys

Application couple cross-plateforme — double horloge, outils de connexion à distance, déployée en PWA web et app Android native.

🌐 **Web (PWA)** : [chetlys.vercel.app](https://chetlys.vercel.app)
📱 **Android** : build local via `flutter run`

---

## Features

- **Double horloge** — heure en temps réel à Paris 🇫🇷 et Phnom Penh 🇰🇭, date en français
- **Status contextuel** — 🌙 dort / 🌅 se réveille / ☀️ matinée / 🍽️ déjeuner / 🌆 soirée
- **Décalage horaire dynamique** — calculé depuis les offsets de timezone réels
- **Distance** — 9 074 km affichés entre les deux cards
- **PWA installable** — Lys peut l'ajouter à son écran d'accueil iPhone depuis Safari

---

## Architecture

```
lib/
└── main.dart
    ├── ChetLysApp          # MaterialApp — thème sombre #0F0F1A
    ├── ClockScreen         # Stateful — Timer 1s, calcule les deux fuseaux
    ├── _ClockCard          # Card par personne (heure, date, status)
    └── _DistanceIndicator  # 9 074 km + décalage horaire
```

```
┌─────────────────────────────────────────┐
│           Flutter (Dart)                │
│                                         │
│  ClockScreen                            │
│  ├── Timer.periodic(1s)                 │
│  │   └── DateTime.now().toUtc()         │
│  │                                      │
│  ├── tz.TZDateTime.now('Europe/Paris')  │
│  └── tz.TZDateTime.now('Asia/Phnom_Penh')│
│                                         │
│  _ClockCard                             │
│  ├── _timeStr  → HH:mm:ss              │
│  ├── _dateStr  → lundi 3 mars (fr)     │
│  └── _status   → emoji + libellé       │
│                                         │
│  _DistanceIndicator                     │
│  └── diffHours = phnomPenh.offset      │
│                  - paris.offset        │
└─────────────────────────────────────────┘
         │ flutter build web        │ flutter run
         ▼                         ▼
┌─────────────────┐    ┌─────────────────────┐
│  build/web/     │    │  Android APK        │
│  (static files) │    │  (debug / release)  │
│       │         │    └─────────────────────┘
│       ▼         │
│  Vercel CDN     │
│  chetlys.vercel │
│  .app           │
└─────────────────┘
```

---

## Tech Stack

| Layer | Technologie |
|-------|------------|
| Langage | Dart |
| Framework | Flutter 3 (stable) |
| Timezones | `timezone: ^0.10.0` |
| Cible Android | API 24+ (Android 7.0) |
| Cible Web | PWA — Chrome, Safari, Firefox |
| Hébergement web | Vercel (static, outputDirectory: build/web) |
| Gestionnaire Flutter | [Puro](https://puro.dev) |

---

## Roadmap

- [x] Double horloge Paris / Phnom Penh
- [ ] Bouton "I need a hug" — push notification instantanée
- [ ] Countdown — décompte vers la prochaine rencontre
- [ ] Coffre à souvenirs — photos & messages privés
- [ ] Auth — Google Sign-In pour les deux utilisateurs

---

## Build & Run

### Android

```bash
# Connecter le téléphone (filaire ou sans fil)
adb pair <ip>:<pair-port>   # entrer le code à 6 chiffres
adb connect <ip>:<port>     # port affiché sur l'écran principal

# Lancer en mode debug
flutter run -d <device-id>
```

### Web (dev)

```bash
flutter run -d chrome
```

### Web (production → Vercel)

```bash
flutter build web --release
# Les fichiers sont dans build/web/
# Déployer :
vercel --prod
```

> **Note** : `build/web` est commité dans le repo (le seul sous-dossier de `build/` non ignoré) car Vercel ne peut pas installer Flutter pour compiler côté serveur. Lors de chaque mise à jour, rebuilder puis `vercel --prod`.

---

## Documentation

- [Architecture](docs/architecture.md) — Structure du code et flux de données
- [Choix techniques](docs/technical-choices.md) — Pourquoi Flutter, pourquoi Vercel

---

## License

Projet privé — Chet & Lys.
