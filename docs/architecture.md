# Architecture

## Vue d'ensemble

L'application est un **widget Flutter pur** — pas de backend, pas d'état serveur. Toute la logique repose sur l'heure locale de l'appareil (ou du navigateur) et la librairie `timezone` pour convertir vers les fuseaux cibles. Le même code Dart tourne sur Android et dans le navigateur via compilation vers JavaScript.

---

## Structure du code

```
lib/
└── main.dart                  # Tout le code applicatif (~310 lignes)
    │
    ├── main()                 # Point d'entrée — init timezones + UI
    │
    ├── ChetLysApp             # StatelessWidget
    │   └── MaterialApp        # thème sombre, debugBanner off
    │
    ├── ClockScreen            # StatefulWidget — cœur de l'app
    │   ├── _timer             # Timer.periodic(1s) → setState
    │   ├── _now               # DateTime UTC courant
    │   ├── _timeIn(zone)      # → tz.TZDateTime pour une timezone
    │   └── build()            # Column : header + card + distance + card
    │
    ├── _ClockCard             # StatelessWidget — card par personne
    │   ├── _timeStr           # "HH:mm:ss"
    │   ├── _dateStr           # "lundi 3 mars" (fr hardcodé)
    │   └── _status            # emoji + libellé selon l'heure
    │
    └── _DistanceIndicator     # StatelessWidget — séparateur central
        └── _timeDiff          # calcul décalage depuis timeZoneOffset
```

---

## Flux de données

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
                  ├──▶ _ClockCard (Chet)
                  │     ├── _timeStr  → "14:32:07"
                  │     ├── _dateStr  → "samedi 22 février"
                  │     └── _status   → "☀️ après-midi"
                  │
                  ├──▶ _ClockCard (Lys)
                  │     ├── _timeStr  → "20:32:07"
                  │     ├── _dateStr  → "samedi 22 février"
                  │     └── _status   → "🌆 soirée"
                  │
                  └──▶ _DistanceIndicator
                        └── offset diff → "+6h"
```

---

## Cycle de rendu

```
initState()
    └── Timer.periodic(Duration(seconds: 1))
            └── setState(() => _now = DateTime.now().toUtc())
                    └── build()  ← Flutter reconstruit l'arbre de widgets
                            └── _timeIn() recalcule depuis tz.TZDateTime.now()
```

Chaque seconde, `setState` invalide le widget `ClockScreen`. Flutter redessine uniquement les parties qui ont changé (les textes d'heure dans les cards). Le reste (layout, couleurs, dégradé) est identique → Flutter diff → pas de re-render inutile.

---

## Déploiement dual-cible

```
                  Code Dart (lib/main.dart)
                          │
              ┌───────────┴───────────┐
              │                       │
    flutter build apk          flutter build web
              │                       │
              ▼                       ▼
    Android APK (ARM/x86)      build/web/ (HTML + JS + WASM)
    Dalvik VM / ART            Navigateur (V8 / CanvasKit)
              │                       │
    Installé sur téléphone     Déployé sur Vercel CDN
    adb install ...            https://chetlys.vercel.app
```

### Android
- Le code Dart est compilé en bytecode natif ARM (AOT)
- Flutter engine embarqué dans l'APK
- Rendu via Skia / Impeller directement sur le GPU

### Web
- Le code Dart est transpilé en JavaScript (`dart2js`)
- Le rendu utilise **CanvasKit** (Skia compilé en WebAssembly)
- PWA : `manifest.json` + service worker → installable sur iOS Safari et Android Chrome

---

## Timezone — fonctionnement

```dart
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

// init une seule fois au démarrage
tz_data.initializeTimeZones();

// conversion
tz.TZDateTime.now(tz.getLocation('Europe/Paris'))
// → respecte heure d'été / heure d'hiver automatiquement
// → DST géré par la base IANA embarquée dans le package
```

La base IANA (toutes les timezones mondiales, ~500 kb) est incluse dans le bundle par le package `timezone`. Cela évite toute dépendance système ou appel réseau.

---

## PWA — installation sur iPhone

```
Lys ouvre Safari → https://chetlys.vercel.app
        │
        ▼
Safari charge index.html
    ├── manifest.json  → nom "Chet & Lys", thème #0F0F1A
    ├── flutter.js     → bootstrap Flutter engine
    └── main.dart.js   → code applicatif transpilé
        │
Lys : Partager → "Sur l'écran d'accueil"
        │
        ▼
Icône "Chet & Lys" créée
    └── Lance en mode standalone (sans barre Safari)
        → identique à une app native visuellement
```
